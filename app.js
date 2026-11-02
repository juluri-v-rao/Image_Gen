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

    // Generate is a user click, so the browser allows re-confirming folder access here.
    if (folderHandle) { await folderReady(true); refreshFolderStatus(); }

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

      let okCount = 0; const errors = []; const saves = [];
      // Cards are prepended, so walk backwards to show results in input order.
      [...results.keys()].reverse().forEach((i) => {
        const r = results[i], job = jobs[i];
        if (r.ok) {
          okCount++;
          const seed = job.body.seed ?? r.value.data?.result?.seed;
          r.value.images.forEach((src) => {
            addResult(src, seed, job.input);
            saves.push({ src, meta: { prompt: job.body.instruction, inputLabel: job.input?.label, seed } });
          });
        }
        else errors.push(`${job.input ? job.input.label + ": " : ""}${r.error}`);
      });
      errors.reverse();
      if (errors.length && !okCount) setStatus("error", errors.join("\n\n"));
      else if (errors.length) setStatus("error", `${okCount}/${jobs.length} succeeded.\n${errors.join("\n")}`);
      else setStatus("done", `Done: ${okCount} request${okCount > 1 ? "s" : ""} completed. Saved to Gallery.`);
      // Save in input order (saves was filled in reverse).
      for (const s of saves.reverse()) await saveToGallery(s.src, s.meta);
    } finally {
      $("submitBtn").disabled = false;
      updateImageInfo();
    }
  }

  /* ---------------- Gallery (IndexedDB) ---------------- */
  // Records: { id, createdAt, prompt, inputLabel, seed, url, blob? }. The blob is kept when the
  // image can be fetched, so it survives even after Bria's result URL expires.
  const DB_NAME = "fibo_gallery", STORE = "images", META = "meta";
  let dbPromise = null;
  function db() {
    if (!dbPromise) dbPromise = new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => {
        r.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
        r.result.createObjectStore(META);
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbPromise;
  }
  async function tx(store, mode, fn) {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction(store, mode);
      const out = fn(t.objectStore(store));
      t.oncomplete = () => res(out && "result" in out ? out.result : undefined);
      t.onerror = () => rej(t.error);
    });
  }
  const galleryAll = () => tx(STORE, "readonly", (s) => s.getAll());
  const galleryAdd = (rec) => tx(STORE, "readwrite", (s) => s.add(rec));
  const galleryDel = (id) => tx(STORE, "readwrite", (s) => s.delete(id));
  const galleryClear = () => tx(STORE, "readwrite", (s) => s.clear());
  const metaGet = (k) => tx(META, "readonly", (s) => s.get(k));
  const metaSet = (k, v) => tx(META, "readwrite", (s) => (v === undefined ? s.delete(k) : s.put(v, k)));

  const extFor = (type) => (/jpe?g/.test(type) ? "jpg" : /webp/.test(type) ? "webp" : "png");
  const pad = (n) => String(n).padStart(2, "0");
  function fileName(rec, i) {
    const d = new Date(rec.createdAt);
    const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    const words = (rec.prompt || "image").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "image";
    return `fibo_${stamp}_${rec.id ?? i}_${words}.${extFor(rec.blob?.type || "")}`;
  }

  async function fetchBlob(src) {
    try { const r = await fetch(src); if (!r.ok) return null; const b = await r.blob(); return b.type.startsWith("image/") || src.startsWith("data:") ? b : null; }
    catch { return null; } // e.g. CORS blocked: keep the URL only
  }

  // ---- Auto-save folder (File System Access API: Chrome / Edge) ----
  const folderSupported = "showDirectoryPicker" in window;
  let folderHandle = null;

  async function folderReady(ask) {
    if (!folderHandle) return false;
    const opts = { mode: "readwrite" };
    if ((await folderHandle.queryPermission(opts)) === "granted") return true;
    if (!ask) return false;
    try { return (await folderHandle.requestPermission(opts)) === "granted"; } catch { return false; }
  }

  async function refreshFolderStatus() {
    const el = $("folderStatus"), btn = $("chooseFolder");
    if (!folderSupported) {
      btn.hidden = true;
      el.textContent = "Tip: in Chrome or Edge you can also auto-save every image into a folder on your computer.";
      return;
    }
    if (!folderHandle) { el.textContent = ""; el.classList.remove("on"); btn.textContent = "Auto-save to a folder…"; return; }
    const ok = await folderReady(false);
    el.classList.toggle("on", ok);
    el.textContent = ok ? `Auto-saving new images to folder “${folderHandle.name}”.`
                        : `Folder “${folderHandle.name}” selected. Access will be re-confirmed on your next Generate.`;
    btn.textContent = "Change folder…";
  }

  async function chooseFolder() {
    try {
      const h = await window.showDirectoryPicker({ id: "fibo-gallery", mode: "readwrite" });
      folderHandle = h;
      await metaSet("folder", h);
      await refreshFolderStatus();
      const recs = await galleryAll();
      if (recs.some((r) => r.blob) && await confirmDialog(`Also copy the ${recs.filter((r) => r.blob).length} images already in the gallery into “${h.name}”?`, "Copy")) {
        for (const r of recs) if (r.blob) await writeToFolder(r);
        setStatus("done", `Copied gallery images to “${h.name}”.`);
      }
    } catch (e) { if (e.name !== "AbortError") setStatus("error", `Could not use that folder: ${e.message}`); }
  }

  async function writeToFolder(rec) {
    if (!rec.blob || !(await folderReady(false))) return false;
    try {
      const fh = await folderHandle.getFileHandle(fileName(rec), { create: true });
      const w = await fh.createWritable(); await w.write(rec.blob); await w.close();
      return true;
    } catch (e) { log("Folder save failed", e.message); return false; }
  }

  async function saveToGallery(src, meta) {
    const blob = await fetchBlob(src);
    const rec = { createdAt: Date.now(), prompt: meta.prompt, inputLabel: meta.inputLabel || "", seed: meta.seed ?? null,
                  url: src.startsWith("data:") ? "" : src, blob };
    try { rec.id = await galleryAdd(rec); } catch (e) { log("Gallery save failed", e.message); return; }
    await writeToFolder(rec);
    renderGallery();
  }

  const objectUrls = [];
  async function renderGallery() {
    let recs = [];
    try { recs = await galleryAll(); } catch { /* storage unavailable */ }
    $("galleryCount").textContent = `(${recs.length})`;
    objectUrls.splice(0).forEach((u) => URL.revokeObjectURL(u));
    const q = $("gallerySearch").value.trim().toLowerCase();
    const shown = recs.filter((r) => !q || (r.prompt || "").toLowerCase().includes(q)).reverse();
    const box = $("gallery");
    box.textContent = "";
    $("galleryEmpty").hidden = shown.length > 0;
    $("galleryEmpty").textContent = recs.length ? "No images match your search." : "No images yet. Generated images will appear here.";
    for (const r of shown) {
      const src = r.blob ? URL.createObjectURL(r.blob) : r.url;
      if (r.blob) objectUrls.push(src);
      const card = document.createElement("div"); card.className = "result-card";
      const img = document.createElement("img"); img.src = src; img.alt = r.prompt || "Generated image"; img.loading = "lazy";
      const meta = document.createElement("div"); meta.className = "meta";
      const p = document.createElement("div"); p.className = "prompt"; p.textContent = r.prompt || ""; p.title = r.prompt || "";
      const info = document.createElement("div");
      info.textContent = [new Date(r.createdAt).toLocaleString(), r.inputLabel, r.seed != null ? `seed ${r.seed}` : ""].filter(Boolean).join(" · ");
      meta.append(p, info);
      const actions = document.createElement("div"); actions.className = "actions";
      const dl = document.createElement("a"); dl.href = src; dl.textContent = "Download";
      if (r.blob) dl.download = fileName(r); else { dl.target = "_blank"; dl.rel = "noopener"; }
      const del = document.createElement("button"); del.type = "button"; del.className = "link-btn"; del.textContent = "Delete";
      del.addEventListener("click", async () => {
        if (await confirmDialog("Delete this image from the gallery?", "Delete")) { await galleryDel(r.id); renderGallery(); }
      });
      actions.append(dl, del);
      card.append(img, meta, actions);
      box.append(card);
    }
  }

  async function downloadAll() {
    const recs = await galleryAll();
    if (!recs.length) { setStatus("error", "The gallery is empty."); return; }
    if (typeof JSZip === "undefined") { setStatus("error", "ZIP library failed to load. Check your connection and refresh."); return; }
    const btn = $("downloadAll"); btn.disabled = true; btn.textContent = "Preparing ZIP…";
    try {
      const zip = new JSZip(); let added = 0, skipped = 0;
      const index = [];
      for (const [i, r] of recs.entries()) {
        const blob = r.blob || (r.url && (await fetchBlob(r.url)));
        if (!blob) { skipped++; continue; }
        const name = fileName({ ...r, blob }, i);
        zip.file(name, blob); added++;
        index.push({ file: name, prompt: r.prompt, input: r.inputLabel, seed: r.seed, created: new Date(r.createdAt).toISOString() });
      }
      if (!added) { setStatus("error", "None of the images could be downloaded (their links may have expired)."); return; }
      zip.file("prompts.json", JSON.stringify(index, null, 2));
      const out = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      const d = new Date();
      a.href = URL.createObjectURL(out);
      a.download = `fibo_gallery_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.zip`;
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      setStatus("done", `ZIP downloaded with ${added} image${added > 1 ? "s" : ""}${skipped ? ` (${skipped} skipped: link expired)` : ""}.`);
    } finally { btn.disabled = false; btn.textContent = "Download all (ZIP)"; }
  }

  async function initGallery() {
    document.querySelectorAll(".out-tabs .tab").forEach((t) => t.addEventListener("click", () => {
      document.querySelectorAll(".out-tabs .tab").forEach((x) => x.classList.toggle("active", x === t));
      $("viewLatest").hidden = t.dataset.view !== "latest";
      $("viewGallery").hidden = t.dataset.view !== "gallery";
      if (t.dataset.view === "gallery") renderGallery();
    }));
    $("downloadAll").addEventListener("click", downloadAll);
    $("chooseFolder").addEventListener("click", chooseFolder);
    $("gallerySearch").addEventListener("input", renderGallery);
    $("clearGallery").addEventListener("click", async () => {
      const n = (await galleryAll()).length;
      if (!n) return;
      if (await confirmDialog(`Delete all ${n} images from the gallery? Tip: use “Download all (ZIP)” first to keep a copy.`, "Delete all")) {
        await galleryClear(); renderGallery();
      }
    });
    try { folderHandle = (await metaGet("folder")) || null; } catch { folderHandle = null; }
    refreshFolderStatus();
    renderGallery();
  }

  /* ---------------- Init ---------------- */
  function init() {
    refreshKeyStatus();
    initImageInputs();
    initOptions();
    initGallery();
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
