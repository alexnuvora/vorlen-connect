# Vorlen Oracle: free-only policy

The owner requires zero Oracle charges. Do not upgrade the Oracle tenancy to paid status, resize the worker, launch extra instances, grow or add volumes, buy images/licences/proxies, enable paid backups or introduce paid OCI services. If capacity is insufficient, queue or stop work and report the constraint rather than adding paid capacity.

Approved target: the existing VM.Standard.E2.1.Micro in uk-london-1, instance ending nypzrogqudg7a, public IP 145.241.230.145. Both deployment scripts verify exact instance, shape and region before installing software. These scripts do not call cloud provisioning APIs. They are not a tenancy-wide spending lock.

The 1 GB swap file lives inside the existing boot filesystem. No cloud volume was added or resized. Keep one browser active at a time and bounded worker memory.

Run the read-only Oracle cost audit workflow to inspect the home region, regional instance/storage/backup totals and tenancy reported costs. It creates no Oracle resources and prints no credentials. A passing footprint check is not a zero-billing guarantee: payment status, other regions/services, delayed billing data and future changes must be considered. Do not present budgets as hard caps.

For the strongest no-charge protection, keep the Oracle account as Free Tier without upgrading to a paid account. Oracle documents that the card is not charged unless the account is upgraded. If already paid, obtain confirmation of existing charges and resource-specific limits; do not change tenancy-wide quotas or delete existing resources without reviewing the impact with the owner.

Sources checked 12 October 2026:
- https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm
- https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- https://docs.oracle.com/en-us/iaas/Content/Billing/Concepts/budgetsoverview.htm
