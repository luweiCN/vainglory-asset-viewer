#!/usr/bin/env python3

import argparse
import hashlib
from pathlib import Path

import zstandard


EXPECTED_ARCHIVE_SHA256 = "b814cc5fe60b0ecf020560731c9f5b74271a2fddbd7c1842b671b721421143ba"
EXPECTED_APP_SIZE = 3_566_006_003
PART_NAMES = [
    "runtime-app.asar.zst.part-00-00",
    "runtime-app.asar.zst.part-00-01",
    "runtime-app.asar.zst.part-00-02",
    "runtime-app.asar.zst.part-00-03",
    "runtime-app.asar.zst.part-01-00",
    "runtime-app.asar.zst.part-01-01",
    "runtime-app.asar.zst.part-01-02",
    "runtime-app.asar.zst.part-01-03",
    "runtime-app.asar.zst.part-02",
    "runtime-app.asar.zst.part-03",
]


class SplitArchiveReader:
    def __init__(self, parts: list[Path]):
        self.parts = iter(parts)
        self.current = None

    def read(self, size: int = -1) -> bytes:
        chunks = []
        remaining = size
        while remaining != 0:
            if self.current is None:
                try:
                    self.current = next(self.parts).open("rb")
                except StopIteration:
                    break
            chunk = self.current.read(remaining)
            if chunk:
                chunks.append(chunk)
                if remaining > 0:
                    remaining -= len(chunk)
                continue
            self.current.close()
            self.current = None
        return b"".join(chunks)

    def close(self) -> None:
        if self.current is not None:
            self.current.close()
            self.current = None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--parts-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--delete-parts", action="store_true")
    args = parser.parse_args()

    parts = [args.parts_dir / name for name in PART_NAMES]
    missing = [part.name for part in parts if not part.is_file()]
    if missing:
        raise SystemExit(f"Missing release archive parts: {', '.join(missing)}")

    digest = hashlib.sha256()
    for part in parts:
        with part.open("rb") as source:
            while chunk := source.read(8 * 1024 * 1024):
                digest.update(chunk)
    if digest.hexdigest() != EXPECTED_ARCHIVE_SHA256:
        raise SystemExit("Release archive checksum mismatch")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    reader = SplitArchiveReader(parts)
    try:
        with args.output.open("wb") as target:
            zstandard.ZstdDecompressor().copy_stream(reader, target)
    finally:
        reader.close()

    if args.output.stat().st_size != EXPECTED_APP_SIZE:
        args.output.unlink(missing_ok=True)
        raise SystemExit("Restored app.asar size mismatch")

    if args.delete_parts:
        for part in parts:
            part.unlink()

    print(f"Restored {args.output} ({EXPECTED_APP_SIZE} bytes)")


if __name__ == "__main__":
    main()
