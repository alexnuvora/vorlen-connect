# Vorlen interactive browser broker — infrastructure phase

The initial broker is deliberately bound to 127.0.0.1:8765 and supports local
health checks only. Interactive start requests fail closed until owner
authentication, scoped transport, anti-CSRF controls, user handoff and
credential vault deletion can be verified.

The VM has only 951 MiB RAM. Chromium is not installed by this change because
a persistent browser can exhaust the VM. Before enabling a browser, provision
a host with adequate memory and an authenticated interactive desktop or
browser streaming channel. Do not expose CDP, VNC, noVNC or browser debugging
ports publicly.

This code does not implement LinkedIn sign-in, session persistence, own-profile
retrieval, inbox, invitations, messaging, or Recruiter access. These features
must be independently verified against permitted provider capabilities.

Health endpoint, localhost only:
`curl http://127.0.0.1:8765/health`
