"""Read-only diagnostics for the one explicitly authorized Vorlen worker VM.

Never dump SDK objects containing metadata, user-data, API keys or config.
No reboot, firewall edit, Run Command or disk operation is performed here.
"""
import configparser
import json
import os
from pathlib import Path
import socket
import tempfile

import oci

INSTANCE = 'ocid1.instance.oc1.uk-london-1.anwgiljtdycw3nacwvc2l7y6y5mgkfyn2oawv2locpcblhzvewsdrxn243ca'
TENANCY = 'ocid1.tenancy.oc1..aaaaaaaaclnmrik5hypi734mzstra5mi752uy5ljxzihburzc3athnmpxw2a'
IP = '193.123.183.10'
REGION = 'uk-london-1'


def emit(section, value):
    print(json.dumps({'section': section, 'result': value}, default=str), flush=True)


def safe_error(exc):
    # Messages can contain request details. Only expose structured error codes.
    return {'error_type': type(exc).__name__, 'status': getattr(exc, 'status', None),
            'code': getattr(exc, 'code', None)}


def attempt(section, fn):
    try:
        return fn()
    except Exception as exc:
        emit(section, safe_error(exc))
        return None


def pick(obj, *fields):
    return {key: getattr(obj, key, None) for key in fields}


def rules(items):
    return [pick(r, 'direction', 'protocol', 'source', 'source_type', 'destination',
                 'destination_type', 'is_stateless') | {
                     'tcp_options': oci.util.to_dict(getattr(r, 'tcp_options', None)),
                     'udp_options': oci.util.to_dict(getattr(r, 'udp_options', None))}
            for r in items]


def diagnose(config):
    compute = oci.core.ComputeClient(config, timeout=(10, 30))
    network = oci.core.VirtualNetworkClient(config, timeout=(10, 30))
    instance = compute.get_instance(INSTANCE).data
    if instance.id != INSTANCE:
        raise ValueError('Unexpected instance')
    emit('instance', pick(instance, 'id', 'display_name', 'lifecycle_state', 'shape',
                          'availability_domain', 'fault_domain', 'time_created'))
    emit('shape', oci.util.to_dict(instance.shape_config))
    emit('agent_configuration', oci.util.to_dict(instance.agent_config))
    emit('launch_options', oci.util.to_dict(instance.launch_options))
    emit('existing_ssh_public_key_count', len([
        line for line in (instance.metadata or {}).get('ssh_authorized_keys', '').splitlines()
        if line.strip()]))

    plugins = attempt('agent_plugins', lambda: oci.compute_instance_agent.PluginClient(
        config, timeout=(10, 30)).list_instance_agent_plugins(instance.compartment_id, INSTANCE).data)
    if plugins is not None:
        emit('agent_plugins', [pick(p, 'name', 'status', 'time_last_updated') for p in plugins])

    image = attempt('image', lambda: compute.get_image(instance.image_id).data)
    if image:
        emit('image', pick(image, 'display_name', 'operating_system', 'operating_system_version'))

    attachments = attempt('vnics', lambda: compute.list_vnic_attachments(
        instance.compartment_id, instance_id=INSTANCE).data)
    for attachment in attachments or []:
        if attachment.lifecycle_state != 'ATTACHED':
            continue
        vnic = attempt('vnic', lambda: network.get_vnic(attachment.vnic_id).data)
        if not vnic:
            continue
        emit('vnic', pick(vnic, 'id', 'is_primary', 'private_ip', 'public_ip',
                          'lifecycle_state', 'subnet_id', 'nsg_ids'))
        subnet = attempt('subnet', lambda: network.get_subnet(vnic.subnet_id).data)
        if subnet:
            emit('subnet', pick(subnet, 'id', 'cidr_block', 'prohibit_internet_ingress',
                               'prohibit_public_ip_on_vnic', 'route_table_id', 'security_list_ids'))
            route = attempt('routes', lambda: network.get_route_table(subnet.route_table_id).data)
            if route:
                emit('routes', [pick(r, 'destination', 'destination_type', 'network_entity_id')
                                for r in route.route_rules])
                for rule in route.route_rules:
                    if rule.network_entity_id.startswith('ocid1.internetgateway.'):
                        gateway = attempt('internet_gateway', lambda: network.get_internet_gateway(rule.network_entity_id).data)
                        if gateway:
                            emit('internet_gateway', pick(gateway, 'id', 'is_enabled', 'lifecycle_state'))
            for security_id in subnet.security_list_ids:
                security = attempt('security_list', lambda: network.get_security_list(security_id).data)
                if security:
                    emit('security_list', {'id': security.id,
                                          'ingress': rules(security.ingress_security_rules),
                                          'egress': rules(security.egress_security_rules)})
        for nsg_id in vnic.nsg_ids or []:
            nsg_rules = attempt('network_security_group', lambda: oci.pagination.list_call_get_all_results(
                network.list_network_security_group_security_rules, nsg_id).data)
            if nsg_rules is not None:
                emit('network_security_group', {'id': nsg_id, 'rules': rules(nsg_rules)})
        if vnic.public_ip == IP:
            try:
                with socket.create_connection((IP, 22), timeout=10) as sock:
                    sock.settimeout(5)
                    banner = sock.recv(160).decode('ascii', errors='replace').strip()
                    emit('ssh_connectivity', {'reachable': True, 'ssh_banner': banner.startswith('SSH-')})
            except OSError as exc:
                emit('ssh_connectivity', {'reachable': False, 'error_type': type(exc).__name__})

    disks = attempt('boot_volumes', lambda: compute.list_boot_volume_attachments(
        instance.availability_domain, instance.compartment_id, instance_id=INSTANCE).data)
    if disks is not None:
        emit('boot_volumes', [pick(d, 'id', 'boot_volume_id', 'lifecycle_state') for d in disks])
    emit('diagnostic_complete', {'read_only': True, 'os_access_verified': False})


def main():
    raw_config = os.environ.pop('VORLEN_OCI_CONFIG', '')
    private_key = os.environ.pop('VORLEN_OCI_API_PRIVATE_KEY', '')
    if not raw_config or not private_key:
        emit('credentials', {'config_present': bool(raw_config), 'api_key_present': bool(private_key)})
        return 1
    parser = configparser.ConfigParser(interpolation=None)
    parser.read_string(raw_config)
    values = parser.defaults()
    config = {k: values.get(k, '').strip() for k in ('user', 'tenancy', 'fingerprint', 'region')}
    if config['tenancy'] != TENANCY or config['region'] != REGION:
        emit('configuration', {'error': 'Config must target the supplied tenancy and uk-london-1'})
        return 1
    with tempfile.TemporaryDirectory(prefix='vorlen-oci-') as directory:
        key_path = Path(directory) / 'api_key.pem'
        key_path.write_text(private_key.strip() + '\n')
        key_path.chmod(0o600)
        config['key_file'] = str(key_path)
        oci.config.validate_config(config)
        diagnose(config)
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception as exc:
        emit('fatal', safe_error(exc))
        raise SystemExit(1)
