# FIBO Image Edit: web app

A static web page for Bria's **FIBO Image Edit** API. Upload an image (or paste an image URL), write a prompt, set options, and get the edited image back.

## Features

- **Multiple input images** (up to 10): upload or drag and drop several files, or paste image URLs one per line. Each image shows as a numbered thumbnail with a remove button.
  - **Edit each image separately**: the same prompt is applied to every image, one request per image
  - **Send all images in one request**: all images go into a single request's `images` array, e.g. as references
- **Prompt / edit instruction**
- **Options**: mask, negative prompt, seed (with a random button), results per image, steps, guidance scale, content moderation, sync/async mode, and a field for extra JSON parameters (a value of `null` removes a parameter from the request)
- **API settings**: base URL and endpoint path, both editable in case Bria changes them
- **Update API key** button: opens a dialog for the new key, then asks you to confirm with **OK / Cancel** before saving. You can also remove the saved key there.
- The button shows how many requests will be sent. More than 8 asks for confirmation first, and at most 3 run at the same time.
- **Gallery**: every generated image is saved automatically in one place, in a **Gallery** tab. It's stored in your browser (IndexedDB), so images stay after you close the page.
  - **Download all (ZIP)**: saves every image into one ZIP file, plus a `prompts.json` with the prompt, input and seed for each image
  - **Auto-save to a folder** (Chrome / Edge): choose a folder on your computer once, and every new image is written there automatically
  - **PIN lock**: the Gallery tab opens only after a 6-digit PIN is entered, on a phone-style keypad or the keyboard. Only a salted hash of the PIN is in the code. It locks again on page reload, with the **Lock** button, or after 5 minutes of inactivity. 5 wrong attempts start a timed lockout. **Change PIN** sets a new PIN for this browser.
  - Search by prompt, download or delete single images, and **Clear gallery** (asks for confirmation first)
- Async requests are handled automatically: the page checks `status_url` until the image is ready.
- A request/response log for debugging. Long base64 strings are shortened in the log.

## Run locally

It's plain HTML, CSS and JavaScript with no build step:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Deploy on GitHub Pages

`.github/workflows/static.yml` deploys the site on every push to the repo's default branch (`claude/funny-bardeen-052pgi`). It needs **Settings → Pages → Source** set to **GitHub Actions**. The site is published at https://juluri-v-rao.github.io/Image_Gen/.

## Notes

- **Your API key** is stored only in your browser's `localStorage` and is sent only to the Bria API, in the `api_token` header. It is never committed to the repo. Anyone using the page has to enter their own key.
- **Defaults:** base URL `https://engine.prod.bria-api.com/v2`, endpoint `/image/edit`. Check the parameter names against Bria's docs (https://platform.bria.ai/image-editing/fibo-image-edit/llms.txt) and change them under **API settings** or **Extra parameters** if needed.
- **CORS:** if the browser shows a "Network error / CORS" message, the Bria API isn't accepting requests sent directly from a browser. In that case you need a small backend proxy that adds the key on the server side.
