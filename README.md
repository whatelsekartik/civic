# CivicWatch

A local-first civic monitoring platform built around existing, authorised CCTV infrastructure.

CivicWatch analyses recorded road footage or authorised camera streams, detects potential civic issues, generates evidence-backed incidents and supports human review and resolution tracking.

## Product direction

- **Primary monitoring backbone:** existing CCTV/NVR feeds.
- **Initial inference:** local computer vision using YOLO, OpenCV and ByteTrack.
- **Future extension:** CivicBot, an optional mobile inspection robot for areas not covered by fixed cameras.
- **Enforcement:** human-reviewed reporting only. CivicWatch does not automatically issue penalties.

## Project status

This repository is being built from scratch. The initial scaffold prioritises a working GUI, upload-and-analyse workflow, visible zones, incident review, and an adapter-based local inference pipeline. Specialised pothole and waste models must be installed separately and must never be represented as available when they are not.

## Planned architecture

- `apps/web`: React + Vite + TypeScript dashboard.
- `services/api`: FastAPI application and local inference integration.
- `packages/shared`: shared API contracts and types.
- `data/`: local runtime data (ignored by Git).
- `models/`: local model weights (ignored by Git).

## Development

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for setup instructions.

## Privacy

Process footage locally by default. Connect only cameras you are authorised to access. Avoid facial recognition, minimise retention, and require human verification before forwarding reports.

## Licence

See [LICENSE](LICENSE). Third-party model and dependency licences remain applicable.
