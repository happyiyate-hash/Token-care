# Token Details Backend

This folder contains the backend-only implementation of the token discovery, provider aggregation, safety analysis, and verification pipeline currently used by the application.

## Purpose

The backend is intentionally separate from `src/` and is not wired into the frontend yet.

The implementation will be migrated function-by-function from the existing application behavior so the eventual API can return the same data contract expected by the donation UI.

## Planned modules

- `tokenDetails.ts` — orchestration entry point
- `providers/` — provider-specific API clients
- `verification/` — safety and verification aggregation
- `normalizers/` — normalize provider responses into the existing frontend shape
- `types/` — backend representations of token, market, safety, and verification data

Do not connect this folder to the frontend until the complete existing token-detail pipeline has been reproduced and tested.
