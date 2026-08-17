"""Shared SSRF guard — reject a host that resolves to a non-public address.

Two server-side features take an operator-supplied host and open a connection
to it: the landing-page site importer (every request a headless browser makes)
and the SMTP send path (a sending profile's ``host``). Both are reachable by an
authenticated operator, so both can otherwise be pointed at cloud metadata
(169.254.169.254), RFC1918 ranges, loopback or a container-network peer.

This module owns the one primitive both use, so the two cannot drift: resolve
the host and refuse it unless *every* resolved address is a genuinely public
(global) IP — never private, loopback, link-local, reserved, multicast,
unspecified, nor the IPv4-mapped form of one.

Residual TOCTOU: DNS can resolve differently between this check and the actual
connection. For a single-tenant, self-hosted tool driven by an already
authorised operator this is an accepted, low-severity residual risk; the
importer additionally re-checks every browser request as it is made.
"""
from __future__ import annotations

import asyncio
import ipaddress
import socket


class UnsafeHostError(Exception):
    """The host is missing, unresolvable, or resolves to a non-public IP.

    The message is safe to show the operator — it never echoes internal
    addresses back."""


def ip_is_public(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    """True only for genuinely public/global IPs."""
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped
    blocked = (
        ip.is_private or ip.is_loopback or ip.is_link_local
        or ip.is_multicast or ip.is_reserved or ip.is_unspecified
    )
    return ip.is_global and not blocked


async def assert_public_host(host: str | None) -> None:
    """Resolve ``host`` and raise :class:`UnsafeHostError` unless every
    resolved address is public."""
    if not host:
        raise UnsafeHostError("No host to connect to")
    loop = asyncio.get_running_loop()
    try:
        infos = await loop.getaddrinfo(host, None, type=socket.SOCK_STREAM)
    except socket.gaierror:
        raise UnsafeHostError("Host could not be resolved")
    if not infos:
        raise UnsafeHostError("Host could not be resolved")
    for info in infos:
        try:
            ip = ipaddress.ip_address(info[4][0])
        except ValueError:
            raise UnsafeHostError("Host resolved to an invalid address")
        if not ip_is_public(ip):
            raise UnsafeHostError(
                "Host targets a private or internal network — refused"
            )
