/* FIBO Image Edit: static client for the Bria v2 API.
 * The API key stays in this browser's localStorage and is sent only to the Bria API. */
(() => {
  "use strict";

  const DEFAULTS = {
    baseUrl: "https://engine.prod.bria-api.com/v2",
    endpoint: "/image/edit",
  };
  const LS = { key: "bria_api_key", baseUrl: "bria_base_url", endpoint: "bria_endpoint" };
  const POLL_MS = 2000;
  const POLL_MAX = 90; // about 3 minutes

  const $ = (id) => document.getElementById(id);
  const store = {
    get(k) { try { return localStorage.getItem(k) || ""; } catch { return ""; } },
    set(k, v) { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch {} },
  };

  /* ---------------- API key handling ---------------- */
  const mask = (k) => (!k ? "none" : k.length <= 8 ? "••••" : `${k.slice(0, 4)}••••${k.slice(-4)}`);

  function refreshKeyStatus() {
    const k = store.get(LS.key);
    const el = $("keyStatus");
    el.textContent = k ? `API key: ${mask(k)}` : "No API key";
    el.classList.toggle("set", !!k);
  }

  function openKeyModal() {
    $("currentKeyMasked").textContent = mask(store.get(LS.key));
    $("newKey").value = "";
    $("newKey").type = "password";
    $("keyError").hidden = true;
    $("keyModal").hidden = false;
    $("newKey").focus();
  }
  const closeKeyModal = () => { $("keyModal").hidden = true; };

  // Promise-based OK / Cancel dialog
  function confirmDialog(text, okLabel = "OK") {
    return new Promise((resolve) => {
      $("confirmText").textContent = text;
      $("confirmOk").textContent = okLabel;
      $("confirmModal").hidden = false;
      $("confirmOk").focus();
      const done = (val) => {
        $("confirmModal").hidden = true;
        $("confirmOk").removeEventListener("click", onOk);
        $("confirmCancel").removeEventListener("click", onCancel);
        document.removeEventListener("keydown", onKey, true);
        resolve(val);
      };
      const onOk = () => done(true);
      const onCancel = () => done(false);
      const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); done(false); } };
      $("confirmOk").addEventListener("click", onOk);
      $("confirmCancel").addEventListener("click", onCancel);
      document.addEventListener("keydown", onKey, true);
    });
  }

  async function saveKey() {
    const v = $("newKey").value.trim();
    if (!v) {
      $("keyError").textContent = "Please enter an API key.";
      $("keyError").hidden = false;
      return;
    }
    const had = !!store.get(LS.key);
    const ok = await confirmDialog(
      had ? `Replace the current API key (${mask(store.get(LS.key))}) with the new key (${mask(v)})?`
          : `Save the API key (${mask(v)}) in this browser?`
    );
    if (!ok) return; // stay in the key dialog so the user can edit or cancel
    store.set(LS.key, v);
    refreshKeyStatus();
    closeKeyModal();
    setStatus("done", "API key updated.");
  }

  async function removeKey() {
    if (!store.get(LS.key)) { closeKeyModal(); return; }
    const ok = await confirmDialog("Remove the saved API key from this browser?", "Remove");
    if (!ok) return;
    store.set(LS.key, "");
    refreshKeyStatus();
    closeKeyModal();
    setStatus("idle", "API key removed.");
  }

  /* ---------------- Input images ---------------- */
  const MAX_IMAGES = 10;
  let imageSource = "upload";
  let uploads = []; // [{ name, dataUrl }]
  let maskDataUrl = "";

  const readAsDataUrl = (file) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });
  // Bria expects raw base64 (no "data:image/...;base64," prefix) or a public URL.
  const stripPrefix = (d) => d.replace(/^data:[^;]+;base64,/, "");

  async function addImageFiles(fileList) {
    const files = [...(fileList || [])].filter((f) => f.type.startsWith("image/"));
    const room = MAX_IMAGES - uploads.length;
    if (files.length > room) setStatus("error", `You can add up to ${MAX_IMAGES} images. Extra files were skipped.`);
    for (const f of files.slice(0, Math.max(0, room))) uploads.push({ name: f.name, dataUrl: await readAsDataUrl(f) });
    renderThumbs();
  }

  function renderThumbs() {
    const box = $("thumbs");
    box.textContent = "";
    uploads.forEach((u, i) => {
      const d = document.createElement("div");
      d.className = "thumb"; d.title = u.name;
      const img = document.createElement("img"); img.src = u.dataUrl; img.alt = u.name;
      const num = document.createElement("span"); num.className = "num"; num.textContent = i + 1;
      const rm = document.createElement("button");
      rm.type = "button"; rm.className = "rm"; rm.textContent = "×"; rm.title = "Remove";
      rm.addEventListener("click", () => { uploads.splice(i, 1); renderThumbs(); });
      d.append(img, num, rm);
      box.append(d);
    });
    $("clearImages").hidden = uploads.length < 2;
    updateImageInfo();
  }

  const urlList = () => $("imageUrls").value.split(/\s+/).map((s) => s.trim()).filter(Boolean);

  // Returns [{ label, thumb, value }]; value is what is sent to the API.
  function getInputImages() {
    if (imageSource === "url") return urlList().slice(0, MAX_IMAGES).map((u, i) => ({ label: `#${i + 1}`, thumb: u, value: u }));
    return uploads.map((u, i) => ({ label: `#${i + 1} ${u.name}`, thumb: u.dataUrl, value: stripPrefix(u.dataUrl) }));
  }
  const multiMode = () => document.querySelector('input[name="multiMode"]:checked').value;

  function requestCount() {
    const imgs = getInputImages().length;
    const n = Math.min(4, Math.max(1, Number($("numResults").value) || 1));
    if (!imgs) return 0;
    return (imgs > 1 && multiMode() === "batch" ? imgs : 1) * n;
  }

  function updateImageInfo() {
    const c = getInputImages().length;
    $("imageCount").textContent = c ? `(${c} selected)` : "(none)";
    $("modeBox").hidden = c < 2;
    const r = requestCount();
    $("submitBtn").textContent = r > 1 ? `Generate (${r} requests)` : "Generate";
  }

  function initImageInputs() {
    document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x === t));
      imageSource = t.dataset.src;
      $("srcUpload").hidden = imageSource !== "upload";
      $("srcUrl").hidden = imageSource !== "url";
      updateImageInfo();
    }));
    $("imageFile").addEventListener("change", async (e) => { await addImageFiles(e.target.files); e.target.value = ""; });
    const dz = $("dropZone");
    ["dragenter", "dragover"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("drag"); }));
    ["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("drag"); }));
    dz.addEventListener("drop", (e) => addImageFiles(e.dataTransfer.files));
    $("clearImages").addEventListener("click", async () => {
      if (await confirmDialog(`Remove all ${uploads.length} images?`, "Remove")) { uploads = []; renderThumbs(); }
    });
    $("imageUrls").addEventListener("input", updateImageInfo);
    $("numResults").addEventListener("input", updateImageInfo);
    document.querySelectorAll('input[name="multiMode"]').forEach((r) => r.addEventListener("change", updateImageInfo));
    $("maskFile").addEventListener("change", async (e) => {
      maskDataUrl = e.target.files[0] ? await readAsDataUrl(e.target.files[0]) : "";
    });
  }

  /* ---------------- Options ---------------- */
  function initOptions() {
    const bind = (input, out) => { const f = () => ($(out).textContent = $(input).value); $(input).addEventListener("input", f); f(); };
    bind("steps", "stepsOut");
    bind("guidance", "guidanceOut");
    $("randSeed").addEventListener("click", () => { $("seed").value = Math.floor(Math.random() * 2 ** 31); });

    $("baseUrl").value = store.get(LS.baseUrl) || DEFAULTS.baseUrl;
    $("endpoint").value = store.get(LS.endpoint) || DEFAULTS.endpoint;
    $("baseUrl").addEventListener("change", () => store.set(LS.baseUrl, $("baseUrl").value.trim()));
    $("endpoint").addEventListener("change", () => store.set(LS.endpoint, $("endpoint").value.trim()));
    $("resetApi").addEventListener("click", () => {
      $("baseUrl").value = DEFAULTS.baseUrl; $("endpoint").value = DEFAULTS.endpoint;
      store.set(LS.baseUrl, ""); store.set(LS.endpoint, "");
    });
  }

  function buildBody(images, seedOverride) {
    const instruction = $("instruction").value.trim();
    if (!instruction) throw new Error("Please enter a prompt / edit instruction.");

    const body = {
      images,
      instruction,
      steps_num: Number($("steps").value),
      guidance_scale: Number($("guidance").value),
      sync: $("syncMode").checked,
    };
    if (maskDataUrl) body.mask = stripPrefix(maskDataUrl);
    const neg = $("negativePrompt").value.trim();
    if (neg) body.negative_prompt = neg;
    if (seedOverride !== undefined) body.seed = seedOverride;
    if ($("modPrompt").checked) body.prompt_content_moderation = true;
    if ($("modInput").checked) body.visual_input_content_moderation = true;
    if ($("modOutput").checked) body.visual_output_content_moderation = true;

    const extra = $("extraJson").value.trim();
    if (extra) {
      let obj;
      try { obj = JSON.parse(extra); } catch { throw new Error("Extra parameters must be valid JSON."); }
      // A value of null removes that key from the request.
      for (const [k, v] of Object.entries(obj)) v === null ? delete body[k] : (body[k] = v);
    }
    return body;
  }

  /* ---------------- API calls ---------------- */
  const apiBase = () => ($("baseUrl").value.trim() || DEFAULTS.baseUrl).replace(/\/+$/, "");
  const apiPath = () => { const p = $("endpoint").value.trim() || DEFAULTS.endpoint; return p.startsWith("/") ? p : `/${p}`; };
  const headers = () => ({ "Content-Type": "application/json", api_token: store.get(LS.key) });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function log(label, data) {
    const redact = (k, v) => (typeof v === "string" && v.length > 300 ? `${v.slice(0, 60)}… (${v.length} chars)` : v);
    $("log").textContent += `\n── ${label} ──\n${typeof data === "string" ? data : JSON.stringify(data, redact, 2)}\n`;
  }

  async function fetchJson(url, opts) {
    let res;
    try { res = await fetch(url, opts); }
    catch (e) {
      throw new Error(`Network error calling ${url}.\nThe browser may be blocking the request (CORS), or the URL is wrong.\n${e.message}`);
    }
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
    if (!res.ok) {
      const msg = json?.error?.message || json?.message || json?.detail || text || res.statusText;
      throw new Error(`HTTP ${res.status}: ${typeof msg === "string" ? msg : JSON.stringify(msg)}`);
    }
    return json;
  }

  // Collect image URLs or base64 images from any response shape.
  function extractImages(obj, out = []) {
    if (!obj) return out;
    if (typeof obj === "string") {
      if (/^https?:\/\//.test(obj) || obj.startsWith("data:image/")) out.push(obj);
      return out;
    }
    if (Array.isArray(obj)) { obj.forEach((x) => extractImages(x, out)); return out; }
    if (typeof obj === "object") {
      for (const [k, v] of Object.entries(obj)) {
        if (/status_url/i.test(k)) continue;
        if (typeof v === "string" && /image|url/i.test(k)) extractImages(v, out);
        else if (typeof v === "object") extractImages(v, out);
      }
    }
    return [...new Set(out)];
  }

  async function runOne(body, idx, total) {
    const tag = total > 1 ? ` [${idx + 1}/${total}]` : "";
    log(`POST ${apiBase()}${apiPath()}${tag}`, body);
    let data = await fetchJson(`${apiBase()}${apiPath()}`, { method: "POST", headers: headers(), body: JSON.stringify(body) });
    log(`Response${tag}`, data);

    let images = extractImages(data.result ?? data);
    if (images.length) return { images, data };

    const statusUrl = data.status_url || (data.request_id && `${apiBase()}/status/${data.request_id}`);
    if (!statusUrl) throw new Error("The response had no image and no request_id/status_url. See the log.");

    for (let i = 0; i < POLL_MAX; i++) {
      setStatus("working", `Processing${tag}… (${(i * POLL_MS) / 1000}s)`);
      await sleep(POLL_MS);
      data = await fetchJson(statusUrl, { headers: headers() });
      const st = String(data.status || "").toUpperCase();
      if (st === "COMPLETED" || st === "SUCCEEDED" || st === "SUCCESS" || st === "DONE") {
        log(`Status${tag}`, data);
        images = extractImages(data.result ?? data);
        if (!images.length) throw new Error("The request completed, but no image was found in the result. See the log.");
        return { images, data };
      }
      if (st === "ERROR" || st === "FAILED" || st === "UNKNOWN") {
        log(`Status${tag}`, data);
        throw new Error(`Request failed: ${data.error?.message || JSON.stringify(data.error || data)}`);
      }
    }
    throw new Error("Timed out waiting for the result.");
  }

  /* ---------------- UI output ---------------- */
  function setStatus(kind, text) { const s = $("status"); s.className = `status ${kind}`; s.textContent = text; }

  function addResult(src, seed, input) {
    const card = document.createElement("div");
    card.className = "result-card";
    const img = document.createElement("img");
    img.src = src; img.alt = "Edited result";
    const actions = document.createElement("div");
    actions.className = "actions";
    if (input) {
      const t = document.createElement("img"); t.className = "src"; t.src = input.thumb; t.alt = ""; t.title = `Input ${input.label}`;
      const l = document.createElement("span"); l.className = "muted"; l.textContent = input.label;
      actions.append(t, l);
    }
    const open = document.createElement("a");
    open.href = src; open.target = "_blank"; open.rel = "noopener"; open.textContent = "Open / download";
    actions.append(open);
    if (seed !== undefined) { const s = document.createElement("span"); s.className = "muted"; s.textContent = `seed ${seed}`; actions.append(s); }
    card.append(img, actions);
    $("results").prepend(card);
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!store.get(LS.key)) { setStatus("error", "Add your Bria API key first."); openKeyModal(); return; }

    const inputs = getInputImages();
    if (!inputs.length) { setStatus("error", "Please add at least one input image."); return; }
    const n = Math.min(4, Math.max(1, Number($("numResults").value) || 1));
    const seedStr = $("seed").value.trim();
    const baseSeed = seedStr === "" ? undefined : Number(seedStr);
    const seedFor = (i) => (baseSeed === undefined ? undefined : baseSeed + i);

    // Each job = one API request. Batch: one per image (x n). Combine/single: all images together (x n).
    const groups = inputs.length > 1 && multiMode() === "batch" ? inputs.map((x) => [x]) : [inputs];
    let jobs;
    try {
      jobs = groups.flatMap((g) => Array.from({ length: n }, (_, i) => ({
        input: g.length === 1 ? g[0] : { label: `All ${g.length} images`, thumb: g[0].thumb },
        body: buildBody(g.map((x) => x.value), seedFor(i)),
      })));
    } catch (err) { setStatus("error", err.message); return; }

    if (jobs.length > 8 && !(await confirmDialog(`This will send ${jobs.length} requests to Bria (each one is billed). Continue?`, "Continue"))) return;

    $("submitBtn").disabled = true;
    $("submitBtn").textContent = "Generating…";
    $("log").textContent = "";
    setStatus("working", `Sending ${jobs.length} request${jobs.length > 1 ? "s" : ""}…`);
    try {
      // Run at most 3 requests at a time to avoid rate limits.
      const results = new Array(jobs.length);
      let next = 0;
      const worker = async () => {
        while (next < jobs.length) {
          const i = next++;
          try { results[i] = { ok: true, value: await runOne(jobs[i].body, i, jobs.length) }; }
          catch (e) { results[i] = { ok: false, error: e.message }; }
        }
      };
      await Promise.all(Array.from({ length: Math.min(3, jobs.length) }, worker));

      let okCount = 0; const errors = [];
      // Cards are prepended, so walk backwards to show results in input order.
      [...results.keys()].reverse().forEach((i) => {
        const r = results[i], job = jobs[i];
        if (r.ok) { okCount++; r.value.images.forEach((src) => addResult(src, job.body.seed ?? r.value.data?.result?.seed, job.input)); }
        else errors.push(`${job.input ? job.input.label + ": " : ""}${r.error}`);
      });
      errors.reverse();
      if (errors.length && !okCount) setStatus("error", errors.join("\n\n"));
      else if (errors.length) setStatus("error", `${okCount}/${jobs.length} succeeded.\n${errors.join("\n")}`);
      else setStatus("done", `Done: ${okCount} request${okCount > 1 ? "s" : ""} completed.`);
    } finally {
      $("submitBtn").disabled = false;
      updateImageInfo();
    }
  }

  /* ---------------- Init ---------------- */
  function init() {
    refreshKeyStatus();
    initImageInputs();
    initOptions();
    $("editForm").addEventListener("submit", onSubmit);
    $("openKeyModal").addEventListener("click", openKeyModal);
    $("cancelKey").addEventListener("click", closeKeyModal);
    $("saveKey").addEventListener("click", saveKey);
    $("removeKey").addEventListener("click", removeKey);
    $("newKey").addEventListener("keydown", (e) => { if (e.key === "Enter") saveKey(); });
    $("toggleKey").addEventListener("click", () => { const k = $("newKey"); k.type = k.type === "password" ? "text" : "password"; });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("keyModal").hidden && $("confirmModal").hidden) closeKeyModal(); });
    if (!store.get(LS.key)) setStatus("idle", "Click “Update API key” to add your Bria API key.");
  }
  init();
})();
