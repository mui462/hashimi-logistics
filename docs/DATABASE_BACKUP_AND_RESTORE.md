# Database backup and restore (Phase 13)

> **Verification status: NOT VERIFIED.** `mongodump`/`mongorestore` and a real MongoDB server are not available in the build environment, so none of the commands below has been executed against this application. They are the standard MongoDB tooling procedure and must be rehearsed once, on a copy, before launch (section 5). Do not treat this document as proof that restores work.

## 1. What must be protected

All business data lives in MongoDB: users, customers, carriers, loads, shipments, quotes, **invoices, carrier payables and the append-only payment ledger**, notification outbox, activity log and CMS content. Files are **not** in MongoDB: documents/PODs/media are in Cloudinary (see `STORAGE_AND_DOCUMENTS.md`). A database backup alone therefore cannot restore uploaded files; keep Cloudinary assets (and their retention) in scope of your recovery plan. Secrets (`.env`) are stored in your secret manager, never in backups or the repository.

## 2. Choose the mechanism by hosting

| Hosting | Recommended backup | Notes |
| --- | --- | --- |
| MongoDB Atlas (M10+) | Continuous cloud backup with point-in-time restore | Configure retention in Atlas; restore into a **new** cluster first. Shared (M0/M2/M5) tiers have no continuous backup: use `mongodump`. |
| Self-hosted replica set | `mongodump --oplog` on a schedule, or filesystem/volume snapshots with the journal | Run against a secondary. |
| Self-hosted standalone | `mongodump` (no `--oplog` on standalone) | Standalone also means no transactions; see `PHASE13_FINAL_AUDIT.md`. |

The financial ledger must be recoverable to a consistent point. Prefer point-in-time or `--oplog` dumps; a plain `mongodump` of a busy database is not a single-instant snapshot.

## 3. Backup (mongodump)

Use a dedicated read-only database user. The URI and password come from your secret manager (shown as variables here).

```bash
# Compressed archive of the application database, timestamped.
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
mongodump --uri="$MONGO_BACKUP_URI" --db=hashimi --gzip --archive="hashimi-$STAMP.archive.gz"
# On a replica set, add --oplog (cannot be combined with --db) for a point-in-time-consistent dump:
# mongodump --uri="$MONGO_BACKUP_URI" --gzip --oplog --archive="hashimi-$STAMP.archive.gz"

# Integrity: record a checksum and copy both off the database host to encrypted storage.
sha256sum "hashimi-$STAMP.archive.gz" > "hashimi-$STAMP.archive.gz.sha256"
```

Recommended policy (a starting point, to be confirmed by the client): daily backups kept 30 days, weekly kept 12 weeks, a backup immediately before every deployment that changes schemas, backups encrypted at rest, restore rights limited to the operator.

## 4. Restore

Always restore into a **new, empty database or cluster first**, verify, then switch the application's `MONGO_URI`. Never restore over production without a fresh backup of the current state.

```bash
sha256sum -c "hashimi-$STAMP.archive.gz.sha256"
# Restore into a scratch database name (use --nsFrom/--nsTo to rename hashimi -> hashimi_restore_check):
mongorestore --uri="$MONGO_RESTORE_URI" --gzip --archive="hashimi-$STAMP.archive.gz" \
  --nsFrom='hashimi.*' --nsTo='hashimi_restore_check.*'
```

After restoring, with `MONGO_URI` pointing at the restored database **and a database name ending in `_verify`**:

```bash
cd backend
npm run db:verify      # real MongoDB? all indexes build? (refuses names not ending _verify/_test)
```

Then check business integrity with the application's own reconciliation: sign in as the Super Admin and open Finance → Overview/Reconciliation (`GET /api/v1/finance/reconciliation`) and confirm there are **no mismatches** between invoice/payable balances and the payment ledger. Spot-check counts of users, invoices and transactions against the production values recorded at backup time.

## 5. Restore rehearsal (required before launch)

1. Take a backup of a staging database that contains realistic test data (never real customer data in a shared environment).
2. Restore it into a new database as in section 4.
3. Run `npm run db:verify`, the backend test suite against a `_test` database on the same server, and the reconciliation endpoint.
4. Record: date, backup size, restore duration, result. A restore time you have not measured is not a recovery objective.
5. Repeat after any schema change and at least quarterly.

## 6. Recovery scenarios

| Scenario | Action |
| --- | --- |
| Accidental deletion/corruption of some records | Restore to a scratch database, export the affected documents, re-insert them manually. Never restore payment-ledger rows selectively without running reconciliation afterwards. |
| Database lost | Provision MongoDB, `npm run db:init`, restore the latest backup, point `MONGO_URI` at it, restart the API and the notification worker. |
| Bad deployment | Follow the rollback section of `PRODUCTION_DEPLOYMENT.md` first; restore data only if the deployment changed data. |
| Uploaded files lost | Restore from Cloudinary's own backup/retention; database rows keep only references. |

## 7. After any restore

- Restart the API and the delivery worker. Stale `financial_locks` rows expire by themselves (30 s) and are removed on contention.
- Pending notification deliveries resume from their stored state; check the Super Admin delivery log for duplicates or a burst of old messages before re-enabling the worker if the backup is old.
- Sessions stay valid only if `JWT_SECRET` is unchanged and `tokenVersion` values match the restored users; users changed after the backup may need to sign in again or reset a password.
