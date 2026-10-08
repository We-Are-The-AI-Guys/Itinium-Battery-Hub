# Depot access rollout

## Access rules

| Area | Depot users / Team Leaders | Itinium admin / accounts | Collectors |
| --- | --- | --- | --- |
| Jobs, summaries, exports | Existing role permissions, additionally client AND explicit location membership | Existing internal access | Existing dedicated collector endpoints only |
| Job URLs, actions, PDFs | Same membership check before handler; foreign nested battery IDs denied | Existing role permissions | Existing assigned/released/scheduled collection checks |
| Drafts | Explicit client and location, no name/creator fallback | All drafts | Denied |
| Location selectors / collection points | Permitted locations only | Existing role permissions | No expanded permissions |
| User administration | TL: depot users wholly within manager's permitted sites; cannot grant other sites | Head-office administrator manages assignments | Denied |
| Notifications | Current job access required at dispatch and when listing | Existing recipient policies | Existing collector policies |
| Stillages | Only explicitly linked client/location records | Existing internal access | Denied |

Defaults are optional and do not grant permission. Membership changes take effect on
the next authenticated request, including existing sessions. Historical unlinked
jobs and stillage entries are not inferred from names and are hidden from clients.
Administrators can correct job ownership from the job detail page; original
collection snapshots remain unchanged.

## Migration and publishing

The additive startup migration creates memberships and a migration marker. Only
valid existing single-site client assignments are imported. Keep the marker:
deleting it could restore a deliberately revoked initial assignment. No empty
assignment is expanded to all locations. Failure aborts startup.

Publish through the supported Publish action, then:

1. Verify the migration and server health.
2. Review users with zero permitted sites in User Access. Select verified sites,
   and optionally select one as their default. Never infer ownership from names.
3. For the reported production account, independently verify its identity and
   existing client, select only that client's verified West Bromwich location,
   and save using User Access. Do not use the similarly named site in another
   client. The production assignment has NOT been performed by this code change.
4. Verify using the affected account that Bridgend and other sites are absent
   from lists, summaries and selectors, and their direct URLs are denied.
5. Review unlinked historical jobs in the internal job list. Open each and use
   “Correct job access ownership” only after its true client/site is verified.

Production SQL writes and automatic historical ownership inference are not part
of this rollout. These controls do not establish whether past exposure occurred.
