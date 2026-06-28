# Changing the Public URL (Domain Migration)

This guide walks through changing the Valhalla Landing Page public URL from **`https://www.valhalla-home.casa`** to **`https://www.schmidlin.casa`**.

It assumes the site is already live on Cloudflare Tunnel (`cloudflared`) as described in [CustomDomainSetup.md](CustomDomainSetup.md). You are swapping the **public hostname** — not rebuilding the cluster, Docker image, or deploy pipeline.

---

## Summary

| Layer | Changes required? |
|-------|-------------------|
| Cloudflare DNS (new domain) | **Yes** — add `schmidlin.casa` |
| Cloudflare Tunnel public hostname | **Yes** — point `www.schmidlin.casa` at the Valhalla Service |
| `cloudflared` pod on k3s | **No** — same tunnel, same backend URL |
| Kubernetes manifests (`k8s/`) | **No** — cluster Service URL is unchanged |
| GitHub Actions / deploy workflow | **No** |
| Website source (`src/`) | **No** — no domain is hardcoded in the page |
| Repo documentation (`README.md`, etc.) | **Yes** — update URLs for accuracy |
| Old domain (`valhalla-home.casa`) | **Optional** — redirect or let expire |

**Backend URL (unchanged):** The tunnel always forwards to the in-cluster Service:

```text
http://valhallalandingpage.valhallalandingpage.svc.cluster.local:80
```

Only the **hostname visitors type in the browser** changes.

---

## Before you start

Gather these:

| Item | Where to find it |
|------|------------------|
| Cloudflare account login | [dash.cloudflare.com](https://dash.cloudflare.com) |
| Cloudflare Zero Trust login | [one.dash.cloudflare.com](https://one.dash.cloudflare.com/) |
| Existing tunnel name | Zero Trust → **Networks** → **Tunnels** (e.g. `homelab-k3s`) |
| SSH access to Mint (home Linux PC) | For verification commands |
| Domain registrar for `schmidlin.casa` | Where you bought (or will buy) the domain |

**Recommended public URL:** `https://www.schmidlin.casa` — mirrors the current `www` pattern. This guide sets that up first, then optionally adds the bare apex (`https://schmidlin.casa`) as a redirect.

---

## Migration overview

Do these phases **in order**. You can run the old and new domains in parallel briefly (Phase 2–4) so there is no gap in public access.

| Phase | What | Downtime |
|-------|------|----------|
| 1 | Register `schmidlin.casa` and add it to Cloudflare | None |
| 2 | Add new tunnel public hostname for Valhalla | None (old URL still works) |
| 3 | Verify `https://www.schmidlin.casa` | None |
| 4 | Update repo documentation | None |
| 5 | Redirect or retire `valhalla-home.casa` | Brief if you delete old route before redirect is live |
| 6 | Update external references | None |

---

## Phase 1 — Register and activate `schmidlin.casa` in Cloudflare

Skip steps you have already completed if `schmidlin.casa` is already **Active** in Cloudflare.

### 1.1 Register the domain

1. Buy **`schmidlin.casa`** from any registrar (Cloudflare Registrar, Namecheap, Porkbun, etc.).
2. You do **not** need to buy through Cloudflare — you only need to point nameservers to Cloudflare after purchase.

### 1.2 Add the site to Cloudflare

1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com).
2. Click **Add a site**.
3. Enter **`schmidlin.casa`** and continue.
4. Choose the **Free** plan.
5. Cloudflare scans existing DNS records (there may be none on a new domain). Review and continue.
6. Cloudflare displays two nameservers, for example:
   - `ada.ns.cloudflare.com`
   - `bob.ns.cloudflare.com`

   Copy both — you need them in the next step.

### 1.3 Point nameservers at your registrar

1. Log in to the registrar where you bought `schmidlin.casa`.
2. Open DNS / nameserver settings for **`schmidlin.casa`**.
3. Replace the default nameservers with the two Cloudflare nameservers from step 1.2.
4. Save. Propagation can take a few minutes to 48 hours.

### 1.4 Confirm the domain is Active

1. Back in Cloudflare Dashboard, open **`schmidlin.casa`**.
2. The overview should show status **Active** (refresh periodically until it does).
3. Go to **SSL/TLS** → **Overview**.
4. Set encryption mode to **Full** (not Full Strict — the origin inside the cluster is plain HTTP on port 80).

---

## Phase 2 — Add the new public hostname on the Cloudflare Tunnel

The tunnel and `cloudflared` pod stay as they are. You only add a new **Public Hostname** route.

### 2.1 Open your existing tunnel

1. Go to [Cloudflare Zero Trust](https://one.dash.cloudflare.com/).
2. Navigate to **Networks** → **Tunnels**.
3. Click your existing tunnel (the one that currently serves `www.valhalla-home.casa`).

Confirm the tunnel shows **Healthy**. If it is down, fix that first:

```bash
# On Mint (SSH)
kubectl get pods -n cloudflared
kubectl logs -n cloudflared -l app=cloudflared --tail=50
```

### 2.2 Add the Valhalla route for the new domain

1. On the tunnel detail page, open the **Public Hostname** tab (or **Published applications** → **Add a public hostname**, depending on UI version).
2. Click **Add a public hostname** (or **Add an application**).
3. Fill in:

| Field | Value |
|-------|-------|
| **Subdomain** | `www` |
| **Domain** | `schmidlin.casa` |
| **Path** | *(leave empty)* |
| **Type** | `HTTP` |
| **URL** | `http://valhallalandingpage.valhallalandingpage.svc.cluster.local:80` |

4. Save.

Cloudflare automatically creates the DNS record (`www` CNAME → tunnel) on **`schmidlin.casa`**. You do not need to add that CNAME manually in the DNS tab.

### 2.3 Confirm DNS was created

1. In Cloudflare Dashboard, select **`schmidlin.casa`** (not Zero Trust — the main DNS dashboard).
2. Go to **DNS** → **Records**.
3. You should see a **`www`** record proxied (orange cloud) pointing at your tunnel.

If it is missing, wait a minute and refresh, or re-save the public hostname in Zero Trust.

---

## Phase 3 — Verify the new URL works

Run these checks before removing the old domain.

### 3.1 Confirm the app is healthy inside the cluster

On Mint:

```bash
kubectl get pods -n valhallalandingpage
```

Expected: **STATUS** `Running`, **READY** `1/1`.

```bash
kubectl run curl-test --rm -it --restart=Never --image=curlimages/curl -- \
  curl -s -o /dev/null -w "HTTP %{http_code}\n" \
  http://valhallalandingpage.valhallalandingpage.svc.cluster.local/
```

Expected: `HTTP 200`.

If this fails, the problem is the nginx pod — not DNS or the tunnel. See [Self-Hosting.md](Self-Hosting.md) troubleshooting.

### 3.2 Test the public URL

From any machine (not only Mint):

```bash
curl -I https://www.schmidlin.casa
```

Expected:

- `HTTP/2 200` (or `HTTP/1.1 200`)
- Valid TLS certificate for `www.schmidlin.casa`

Open **`https://www.schmidlin.casa`** in a browser. You should see the Valhalla landing page (gears, gauges, theme toggle).

### 3.3 If the public URL fails

| Symptom | What to check |
|---------|----------------|
| DNS resolution fails | Domain not **Active** in Cloudflare; nameservers not updated at registrar |
| SSL error | SSL/TLS mode on `schmidlin.casa` — set to **Full** |
| Cloudflare 502 / error page | Tunnel unhealthy: `kubectl get pods -n cloudflared` |
| 404 or wrong app | Public hostname **URL** field — must match the Service URL exactly |
| Timeout | `cloudflared` logs: `kubectl logs -n cloudflared -l app=cloudflared` |

### 3.4 Optional — serve the apex domain (`schmidlin.casa`)

Visitors may type `https://schmidlin.casa` without `www`. Choose one approach:

**Option A — Redirect apex to www (recommended)**

1. Cloudflare Dashboard → **`schmidlin.casa`** → **Rules** → **Redirect Rules** (or **Page Rules** on older accounts).
2. Create a rule:
   - **If:** hostname equals `schmidlin.casa`
   - **Then:** dynamic redirect to `https://www.schmidlin.casa${uri}`, status **301**
3. Save and test: `curl -I https://schmidlin.casa` should show `301` → `www.schmidlin.casa`.

**Option B — Serve the site on both hostnames**

Add a second public hostname on the **same tunnel**:

| Field | Value |
|-------|-------|
| **Subdomain** | *(leave empty / `@` for apex)* |
| **Domain** | `schmidlin.casa` |
| **Type** | `HTTP` |
| **URL** | `http://valhallalandingpage.valhallalandingpage.svc.cluster.local:80` |

Both URLs then serve identical content. Option A avoids duplicate URLs in search engines.

---

## Phase 4 — Update documentation in this repo

The website source does **not** embed the domain. Update docs so future-you and collaborators see the correct URL.

### 4.1 Files to update

Search the repo for the old domain and replace **`valhalla-home.casa`** with **`schmidlin.casa`** where it refers to this site's public URL:

```bash
# From the repo root — preview matches
grep -rn "valhalla-home.casa" .
```

As of this guide, the live URL appears in:

| File | What to change |
|------|----------------|
| [`README.md`](../README.md) | Intro line, local vs production table, hosting section, mermaid diagram label |

Also check (may still mention Tailscale or placeholder domains):

| File | Notes |
|------|-------|
| [`docs/Self-Hosting.md`](Self-Hosting.md) | May still reference `*.ts.net` — update production URL if you keep this doc current |
| [`docs/CustomDomainSetup.md`](CustomDomainSetup.md) | Example tables use `my-domain.com` — optional cleanup |

**Do not change** Kubernetes namespace names, GHCR image names, or internal cluster DNS — those are unrelated to the public domain.

### 4.2 Commit and deploy

1. Edit the files above.
2. Commit and push to **`main`** (or merge a PR).
3. Confirm the [Deploy workflow](https://github.com/mschmidlin1/ValhallaLandingPage/actions) completes successfully.

This deploy updates documentation only — the tunnel hostname is what actually moves traffic. The deploy step is still worth running so `main` matches reality.

### 4.3 GitHub repo metadata (optional)

On [github.com/mschmidlin1/ValhallaLandingPage](https://github.com/mschmidlin1/ValhallaLandingPage):

1. **Settings** → **General** → **Website** — set to `https://www.schmidlin.casa` if you use that field.
2. **About** (right sidebar on the repo home page) — update the website link if present.

---

## Phase 5 — Retire or redirect `valhalla-home.casa`

After `https://www.schmidlin.casa` works, decide what to do with the old domain.

### Option A — Redirect old URL to new (recommended)

Keeps bookmarks and links working.

1. Ensure **`valhalla-home.casa`** is still **Active** in Cloudflare.
2. Cloudflare Dashboard → **`valhalla-home.casa`** → **Rules** → **Redirect Rules**.
3. Create rules (one per hostname you previously used):

| If | Then |
|----|------|
| Hostname is `www.valhalla-home.casa` | 301 redirect to `https://www.schmidlin.casa${uri}` |
| Hostname is `valhalla-home.casa` | 301 redirect to `https://www.schmidlin.casa${uri}` |

4. Test:

```bash
curl -I https://www.valhalla-home.casa
```

Expected: `301` with `Location: https://www.schmidlin.casa/...`

5. In Zero Trust → your tunnel → **Public Hostname**, **delete** the old route for `www.valhalla-home.casa` (the redirect rule handles traffic at the edge; the tunnel route is no longer needed).

### Option B — Let the old domain expire

1. Delete the public hostname for `www.valhalla-home.casa` from the tunnel (Zero Trust → Tunnels → Public Hostname → delete).
2. Do **not** renew `valhalla-home.casa` at the registrar when it expires.

**Warning:** Any link still pointing at `valhalla-home.casa` will break. Use Option A if others may have bookmarked the old URL.

### Option C — Keep both domains serving the same site

Leave both public hostnames on the tunnel indefinitely. No redirect needed, but you maintain two names for the same content (bad for SEO if both are indexed — add a canonical tag or redirect if that matters).

---

## Phase 6 — Update external references

These are outside the repo but easy to forget:

| Location | Action |
|----------|--------|
| Bookmarks / browser favorites | Update to `https://www.schmidlin.casa` |
| Resume, portfolio, LinkedIn, email signature | Replace old URL |
| Other homelab apps linking to Valhalla | Update hardcoded links |
| Future tunnel routes (e.g. Resume Customizer) | Use `*.schmidlin.casa` for new subdomains — see [CustomDomainSetup.md — Phase 6](CustomDomainSetup.md#phase-6--add-resume-customizer-when-deployed) |
| Search engines | Submit new URL in Google Search Console if you use it; set up redirects (Phase 5) so old URLs transfer |

---

## What does **not** need to change

For clarity — these are **intentionally untouched** during a domain swap:

| Component | Why |
|-----------|-----|
| [`k8s/deployment.yaml`](../k8s/deployment.yaml) | No hostname in Deployment |
| [`k8s/service.yaml`](../k8s/service.yaml) | Internal cluster DNS only |
| [`k8s/cloudflared-deployment.yaml`](../k8s/cloudflared-deployment.yaml) | Tunnel token is domain-agnostic |
| [`cloudflared` secret on Mint](../k8s/cloudflared-deployment.yaml) | Same tunnel token |
| [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) | Build and roll out — no public URL |
| [`src/js/links.js`](../src/js/links.js) | Links to portfolio apps, not this landing page |
| Docker / GHCR image name | `ghcr.io/mschmidlin1/valhallalandingpage` |

---

## Adding more apps on the new domain later

When you deploy other tools (Resume Customizer, etc.), add **additional** public hostnames on the **same tunnel** — do not create a second tunnel:

| App | Subdomain | Domain | URL |
|-----|-----------|--------|-----|
| Valhalla (this site) | `www` | `schmidlin.casa` | `http://valhallalandingpage.valhallalandingpage.svc.cluster.local:80` |
| Resume Customizer (example) | `resume-customizer` | `schmidlin.casa` | `http://resumecustomizer.resumecustomizer.svc.cluster.local:80` |

Each subdomain gets its own route; the backend Service URL must match that app's namespace and port.

---

## Troubleshooting

### `www.schmidlin.casa` resolves but shows an old site or Cloudflare error

- Confirm you edited the **Public Hostname** on the correct tunnel.
- Confirm the **Domain** dropdown in Zero Trust shows **`schmidlin.casa`**, not `valhalla-home.casa`.

### Certificate errors

- Domain must be **Active** in Cloudflare (nameservers correct).
- SSL/TLS mode: **Full** on `schmidlin.casa`.
- Wait a few minutes after first hostname publish for edge cert provisioning.

### Site works on old domain but not new

- Old route still on tunnel, new route missing or typo in Service URL.
- Compare both public hostnames side by side in Zero Trust — only the subdomain/domain differ; **URL** must be identical.

### Deploy pipeline broken (unrelated to domain, but common confusion)

Domain changes do not touch CI. If deploys fail, check [Self-Hosting.md — KUBECONFIG gotcha](Self-Hosting.md#common-gotcha-kubeconfig-in-ci).

---

## Completion checklist

Use this list to confirm nothing was skipped:

- [ ] `schmidlin.casa` registered and **Active** in Cloudflare
- [ ] SSL/TLS mode set to **Full** on `schmidlin.casa`
- [ ] Public hostname `www.schmidlin.casa` added on the tunnel with correct Service URL
- [ ] `curl -I https://www.schmidlin.casa` returns **200**
- [ ] Browser loads the Valhalla page at the new URL
- [ ] (Optional) Apex `schmidlin.casa` redirects to `www`
- [ ] `README.md` (and any other docs) updated in git
- [ ] (Optional) Redirect from `www.valhalla-home.casa` to new URL
- [ ] Old tunnel hostname removed or old domain allowed to expire
- [ ] External links and bookmarks updated

---

## See also

- [CustomDomainSetup.md](CustomDomainSetup.md) — original Tailscale → Cloudflare Tunnel migration
- [Self-Hosting.md](Self-Hosting.md) — build, deploy, and cluster health checks
- [Cloudflare Tunnel — Public hostnames](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/routing-to-tunnel/)
- [Cloudflare Redirect Rules](https://developers.cloudflare.com/rules/url-forwarding/)
