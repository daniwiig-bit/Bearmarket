from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from urllib.request import Request, urlopen
from urllib.error import URLError
import json


YAHOO_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?interval=1d&range=1d"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; portfolio-tracker/1.0)"}


def get_price(ticker):
    url = YAHOO_URL.format(ticker=ticker)
    req = Request(url, headers=HEADERS)
    with urlopen(req, timeout=8) as resp:
        data = json.loads(resp.read())
    result = data["chart"]["result"][0]
    price = result["meta"]["regularMarketPrice"]
    currency = result["meta"]["currency"]
    return float(price), str(currency)


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
        except (KeyError, IndexError, TypeError):
            self._respond(404, {"error": f"No price data for {ticker}"})
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
