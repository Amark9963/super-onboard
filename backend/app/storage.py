"""Private object access only; no public URLs or user-controlled object keys."""

import boto3
from botocore.config import Config

from app.config import settings


class ObjectStore:
    def __init__(self):
        self.client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
            region_name="us-east-1",
            config=Config(
                connect_timeout=5,
                read_timeout=15,
                retries={"max_attempts": 2},
                s3={"addressing_style": "path"},
            ),
        )

    def put(self, key: str, data: bytes):
        self.client.put_object(
            Bucket=settings.s3_bucket, Key=key, Body=data, ContentType="application/octet-stream"
        )

    def get(self, key: str) -> bytes:
        body = self.client.get_object(Bucket=settings.s3_bucket, Key=key)["Body"]
        try:
            data = body.read(settings.max_upload_bytes + 1)
            if len(data) > settings.max_upload_bytes:
                raise ValueError("Stored object exceeds size limit")
            return data
        finally:
            body.close()


def get_store():
    return ObjectStore()
