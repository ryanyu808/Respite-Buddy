# Security audit correction — 2026-10-18

The previously reported OpenAI credential exposure was a **false positive**.
The original unbounded regular expression matched the second letter of the word
"ask" in a legitimate Trojans360 article slug. It did not find a standalone key.
The stored slug was compared in memory to an independently indexed public article,
"Ask A Trojan: What's your favourite spot on campus and why?" The paths match
exactly. Its comments also support the three associated campus entries.

No candidate was submitted to OpenAI or any key-validation service. No API key was
printed, used, revoked or rotated. The legitimate citation is preserved; replacing
or purging it would remove useful provenance without addressing a real secret.

## Exact source locations

Both `backend/data/campus-submitted.json` and
`frontend/src/data/campus-submitted.json` contain the same three citations:

| Line | JSON location | Campus entry |
| --- | --- | --- |
| 53 | `$.spots[1].sources[2].url` | URC Student Lounge & Meditation Lounge |
| 188 | `$.spots[6].sources[3].url` | Doheny Library Bookstacks |
| 713 | `$.spots[28].sources[3].url` | Nazarian Pavilion Courtyard + Literatea |

Commit `16aa6d080d2776eb52f92cde4216f1fdbc1859f3` introduced the citation.
As of the investigation, these remote heads contain it:

- `main`
- `feature/ryan-time-indoor-spots`
- `feature/ryan-calm-photo-cards`
- `feature/ryan-visible-time-preferences`
- `feature/ryan-home-locations`
- `feature/ryan-time-aware-picks`
- `feature/ryan-building-route-coverage`
- `feature/ryan-destination-label`
- `feature/ryan-navigation-branding`

The new `feature/ryan-security-audit-correction` branch also inherits it. Local
branches with the same names retain the citation; `origin/HEAD` aliases `main`.
All 16 advertised remote heads and all 16 accessible pull-request head refs were
included in the investigation. PR heads #9–#16 contain the citation. There are no
advertised tags. The 16 pre-investigation commits containing it are:

```text
16aa6d0 8725c9a 5447ff8 bf86d66 305690d c6a08a8 d38a7d5 1696758
6b658a4 aea027e 651df3b 1e09728 3b87f4c d1a26f4 6c4f37b 70e6a86
```

These are citation occurrences, not compromised refs. No history cleanup is
necessary for this finding. No other branch or remote history was modified.

## Frontend exposure check

`CampusDirectory.tsx` imports the submitted-place data, so its citations are
expected in frontend JavaScript. On 2026-10-18 the deployed homepage at
`https://respite-buddy.vercel.app` returned HTTP 200. The main JavaScript asset
`/assets/index-Df3N2E8P.js` contained three loose-pattern matches. All three were
compared in memory and exactly matched the public citation substring. Across the
three retrieved JavaScript/CSS assets, including the discovered dynamic chunk,
there were zero standalone OpenAI-key matches. No URL containing a suspected
secret was requested; only the homepage and its same-origin static assets were
retrieved. This does not enumerate historical deployments or every possible
third-party worker asset.

## Repeatable checks

From the repository root, after building the frontend:

```powershell
.\.venv\Scripts\python.exe -B backend/scripts/audit_secrets.py --history --build frontend/dist
```

The standard-library-only scanner reads tracked/unignored source files, existing
build output, and every locally reachable Git blob/commit. PR heads fetched into
`refs/audit/pull/*/head` are included by `--history`. It writes no files, makes no
network requests and reports only rule names, paths/object IDs, line numbers and
counts. It exits 1 for matches and 2 for incomplete verification. It checks common
credential formats, with token boundaries that avoid the article-slug false
positive, and decompresses gzip data before inspection. Regression tests ensure
standalone synthetic keys, assignments, JSON values, URL query values and compressed
data are still detected and that reporting withholds matching values.

Pattern matching cannot establish that arbitrary text is secret-free. It does
not validate keys, perform entropy analysis, inspect browser IndexedDB or provider
dashboards, or determine the security of all dependencies.

Validation completed for this PR:

- 137 backend tests passed, including 19 scanner regressions.
- 102 frontend unit tests and 43 browser tests passed.
- The frontend production build passed. Its existing large-chunk advisory and
  the backend test client's existing deprecation warning remain.
- The redacted check found zero recognized credential patterns in 186 current
  source files, 424 reachable Git blob/commit objects and 29 build files.
- Both campus-submission data files and all application/routing code are unchanged.

## Current completion steps

1. Review and merge this audit-correction PR through the normal human process.
   The application source data, routing and recommendation code are unchanged.
2. There is no exposed key to revoke on the evidence above. Review provider usage
   if there is an independent reason to suspect a real credential was exposed.
3. No emergency asset purge or frontend redeployment is required for this public
   citation. A normal deployment after merge is sufficient if Vercel tracks main.
4. Enable GitHub secret scanning/push protection, Dependabot alerts and appropriate
   main-branch protection through the owner dashboard. These were disabled or
   absent during the prior audit; they have not been changed by this PR.
5. Contributor author-email privacy and other findings from the wider audit remain
   separate review items. This correction is not a claim of complete security.

## Conditional cleanup plan for a confirmed future credential exposure

**Approval required before rewriting history, force-pushing, deleting branches,
or modifying teammate branches. No commands below have been executed.**

1. Revoke the real key in its provider dashboard first; create a replacement only
   if needed and place it in the existing server-side secret setting. Review usage,
   billing, access logs and permissions. Never put a replacement in Git or Vite
   variables. Deleting source or rewriting history does not revoke a credential.
2. Commit a minimal source correction, test, review and merge it. Redeploy Vercel
   from the cleaned commit; verify the actual published assets, not just source.
   Check Render if any server image or downloadable data contains the value.
3. Inventory every affected branch, tag, PR head/merge ref, release asset, GitHub
   Actions artifact, fork and historical Vercel deployment. Freeze affected pushes
   with teammates and save the exact expected remote SHAs before rewriting.
4. Use an isolated restricted mirror clone, never the shared working tree. With
   explicit approval, use a current `git-filter-repo` supporting
   `--sensitive-data-removal` and a private replacement file provisioned locally,
   outside tracked paths. Do not put the key in command arguments, logs, chat or a
   public PR. Example command containing no credential:

   ```text
   git filter-repo --sensitive-data-removal --replace-text <private-replacement-file>
   ```

5. Review the rewritten commit map and rerun the redacted scanner across all
   rewritten refs. Confirm unrelated files and branch tips were preserved. Obtain
   approval for the concrete branch/tag mapping before updating GitHub. Push only
   explicitly approved refs, with an explicit expected-old-SHA lease per ref.
   Avoid `push --mirror`, broad force pushes and branch deletion. Tags need their
   own approved mapping if any are affected.
6. GitHub-managed `refs/pull/*` are not writable ordinary branches. Work with
   GitHub Support for sensitive-data removal from PR views, cached commit views
   and internal references; rewriting main alone will not remove those copies.
   Coordinate with fork owners, and have teammates re-clone rather than merge old
   contaminated histories back into cleaned branches.
   GitHub Support may decline removal of non-sensitive data or exposures whose
   risk is already mitigated by rotating the credential.
7. Through the Vercel owner dashboard, identify and remove/restrict affected old
   deployments and preview URLs and request cache removal where required. A new
   hashed bundle does not erase old URLs, browser caches, downloads or third-party
   copies. Credential revocation is the essential protection against those copies.
8. Re-inventory advertised refs and deployed assets, rescan, document residual
   copies/limitations and only then end the incident.

Reference: [GitHub sensitive-data removal procedure](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository).
