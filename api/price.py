from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from urllib.request import Request, urlopen
from urllib.error import URLError
import json
import gzip


# Try query1 then query2 — Vercel IPs are sometimes blocked on one but not the other
ENDPOINTS = [
    "https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?interval=1d&range=1d",
    "https://query2.finance.yahoo.com/v8/finance/chart/{ticker}?interval=1d&range=1d",
]

# Full browser headers — Yahoo Finance rejects minimal or bot-looking requests
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://finance.yahoo.com/",
    "Origin": "https://finance.yahoo.com",
}


def get_price(ticker):
    last_err = None
    for url_tmpl in ENDPOINTS:
        url = url_tmpl.format(ticker=ticker)
        try:
            req = Request(url, headers=HEADERS)
            with urlopen(req, timeout=10) as resp:
                raw = resp.read()
                # Yahoo Finance may return gzip even without Accept-Encoding
                if resp.info().get("Content-Encoding") == "gzip":
                    raw = gzip.decompress(raw)
            data = json.loads(raw)
            result = data["chart"]["result"][0]
            price = result["meta"]["regularMarketPrice"]
            currency = result["meta"]["currency"]
            return float(price), str(currency)
        except (KeyError, IndexError, TypeError) as e:
            raise ValueError(f"Unexpected response format for {ticker}") from e
        except Exception as e:
            last_err = e
            continue  # try next endpoint
    raise last_err or RuntimeError("All Yahoo Finance endpoints failed")


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        ticker = params.get("ticker", [""])[0].upper()

        if not ticker:
            self._respond(400, {"error": "Missing ticker parameter"})
            return

        try:
            price, currency = get_price(ticker)
            self._respond(200, {"ticker": ticker, "price": price, "currency": currency})
        except ValueError as e:
            self._respond(404, {"error": str(e)})
        except URLError as e:
            self._respond(502, {"error": f"Yahoo Finance unreachable: {e.reason}"})
        except Exception as e:
            self._respond(500, {"error": str(e)})

    def _respond(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self._respond(200, {})

    def log_message(self, format, *args):
        pass
