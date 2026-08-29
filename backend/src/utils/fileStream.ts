/**
 * fileStream.ts
 *
 * Server-side streaming helpers for files stored remotely (e.g. Cloudinary).
 * The backend fetches the file and pipes the bytes back to the browser, which
 * avoids the two failure modes of browser-side redirects:
 *   - browser CORS enforcement on third-party CDN / API hosts, and
 *   - broken/misconfigured downstream credentials (e.g. a private_download_url
 *     signed with placeholder API secrets returns HTTP 401).
 */
import http from 'http';
import https from 'https';
import type { Response } from 'express';

const MAX_REDIRECTS = 3;

function sanitizeFilename(name: string): string {
  const safe = String(name || 'file')
    .replace(/[\r\n"]/g, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim()
    .slice(0, 200);
  return safe || 'file';
}

function contentDisposition(attachment: boolean, filename: string): string {
  const safe = sanitizeFilename(filename);
  return `${attachment ? 'attachment' : 'inline'}; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

export interface StreamRemoteOptions {
  /** `true` → Content-Disposition: attachment (browser Save-As). */
  attachment: boolean;
  /** Original file name used in the Content-Disposition header. */
  filename: string;
  /** Preferred MIME type; used when the upstream does not send one. */
  mimeType?: string | null;
}

/**
 * Fetches `url` server-side and pipes the bytes to `res` with the proper
 * Content-Type / Content-Disposition. Resolves when the stream finishes,
 * rejects with a useful message when the upstream is unreachable or errors.
 */
export function streamRemoteUrl(
  url: string,
  res: Response,
  options: StreamRemoteOptions
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false;

    const fail = (message: string) => {
      if (!settled) {
        settled = true;
        reject(new Error(message));
      }
    };

    const fetchAndPipe = (target: string, redirectsLeft: number) => {
      let parsed: URL;
      try {
        parsed = new URL(target);
      } catch {
        fail('Invalid storage URL');
        return;
      }

      const transport = parsed.protocol === 'https:' ? https : http;
      const req = transport.get(parsed, { headers: { Accept: '*/*' } }, (upstream) => {
        // Follow a limited number of redirects (signed CDN URLs may bounce).
        if (
          upstream.statusCode &&
          upstream.statusCode >= 300 &&
          upstream.statusCode < 400 &&
          upstream.headers.location
        ) {
          upstream.resume();
          if (redirectsLeft > 0) {
            const next = new URL(upstream.headers.location, parsed).toString();
            fetchAndPipe(next, redirectsLeft - 1);
          } else {
            fail('File storage redirected too many times');
          }
          return;
        }

        const status = upstream.statusCode ?? 502;
        if (status >= 400) {
          upstream.resume();
          fail(`File storage returned HTTP ${status}`);
          return;
        }

        if (settled) {
          upstream.resume();
          return;
        }
        settled = true;

        let contentType = String(
          upstream.headers['content-type'] || options.mimeType || 'application/octet-stream'
        );

        // Cloudinary serves `raw` uploads (PDFs, Office docs, ZIPs, …) with a generic
        // `application/octet-stream` Content-Type and a filename WITHOUT its extension.
        // Passing that through makes the browser refuse to render PDFs inline and can
        // make downloads open as an unknown file type. Whenever the upstream only
        // reports the generic octet-stream, fall back to the real MIME type resolved
        // from the stored DB value / file extension (options.mimeType) so previews
        // render and downloads get the correct type + filename.
        if (
          !contentType ||
          contentType === 'application/octet-stream' ||
          contentType.startsWith('application/octet-stream')
        ) {
          if (options.mimeType && options.mimeType !== 'application/octet-stream') {
            contentType = options.mimeType;
          }
        }

        res.status(status);
        res.setHeader('Content-Type', contentType);
        if (upstream.headers['content-length']) {
          res.setHeader('Content-Length', String(upstream.headers['content-length']));
        }
        res.setHeader(
          'Content-Disposition',
          contentDisposition(options.attachment, options.filename)
        );

        // Stop downloading upstream bytes if the client navigation is aborted.
        res.on('close', () => upstream.destroy());
        upstream.on('error', () => {
          if (!res.headersSent) res.status(502);
          res.end();
        });

        upstream.pipe(res);
        upstream.on('end', () => resolve());
        upstream.on('close', () => resolve());
        upstream.on('error', () => resolve());
      });

      req.on('error', (err) => fail(err.message || 'Failed to fetch file from storage'));
    };

    fetchAndPipe(url, MAX_REDIRECTS);
  });
}