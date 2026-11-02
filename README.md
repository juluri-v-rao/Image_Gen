# FIBO Image Edit: web app

A static web page for Bria's **FIBO Image Edit** API. Upload an image (or paste an image URL), write a prompt, set options, and get the edited image back.

## Features

- **Input image**: upload, drag and drop, or a public image URL
- **Prompt / edit instruction**
- **Options**: mask, negative prompt, seed (with a random button), number of results, steps, guidance scale, content moderation, sync/async mode, and a field for extra JSON parameters (a value of `null` removes a parameter from the request)
- **API settings**: base URL and endpoint path, both editable in case Bria changes them
- **Update API key** button: opens a dialog for the new key, then asks you to confirm with **OK / Cancel** before saving. You can also remove the saved key there.
- Async requests are handled automatically: the page checks `status_url` until the image is ready.
- A request/response log for debugging. Long base64 strings are shortened in the log.

## Run locally

It's plain HTML, CSS and JavaScript with no build step:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Deploy on GitHub Pages

1. Merge this into `main`.
2. In the repo, go to **Settings → Pages → Source** and choose **GitHub Actions**.
3. The workflow in `.github/workflows/pages.yml` publishes the site to `https://<user>.github.io/<repo>/`.

## Notes

- **Your API key** is stored only in your browser's `localStorage` and is sent only to the Bria API, in the `api_token` header. It is never committed to the repo. Anyone using the page has to enter their own key.
- **Defaults:** base URL `https://engine.prod.bria-api.com/v2`, endpoint `/image/edit`. Check the parameter names against Bria's docs (https://platform.bria.ai/image-editing/fibo-image-edit/llms.txt) and change them under **API settings** or **Extra parameters** if needed.
- **CORS:** if the browser shows a "Network error / CORS" message, the Bria API isn't accepting requests sent directly from a browser. In that case you need a small backend proxy that adds the key on the server side.
