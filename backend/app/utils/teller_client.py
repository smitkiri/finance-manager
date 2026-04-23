"""HTTP client for the Teller bank API using mTLS + Basic auth."""

import base64
from typing import Any

import httpx


class TellerClient:
    def __init__(self, cert_path: str, key_path: str):
        self.cert = (cert_path, key_path)

    async def request(self, path: str, access_token: str) -> tuple[int, Any]:
        """Make a GET request to the Teller API.

        Returns (status_code, parsed_json_or_text).
        """
        auth_header = base64.b64encode(f"{access_token}:".encode()).decode()
        async with httpx.AsyncClient(
            base_url="https://api.teller.io",
            cert=self.cert,
        ) as client:
            response = await client.get(
                path,
                headers={
                    "Authorization": f"Basic {auth_header}",
                    "Accept": "application/json",
                },
            )
            try:
                data = response.json()
            except ValueError, UnicodeDecodeError:
                data = response.text
            return response.status_code, data
