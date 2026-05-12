from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import json
import yfinance as yf


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        ticker = params.get("ticker", [""])[0].upper()

        if not ticker:
            self._respond(400, {"error": "Missing ticker parameter"})
            return

        try:
            t = yf.Ticker(ticker)
            fi = t.fast_info
            price = fi.last_price
            currency = getattr(fi, "currency", None)

            if price is None or price == 0:
                # Fallback: try history
                hist = t.history(period="1d")
                if not hist.empty:
                    price = float(hist["Close"].iloc[-1])
                else:
                    self._respond(404, {"error": f"No price found for {ticker}"})
                    return

            if currency is None:
                currency = "NOK" if ticker.endswith(".OL") else "USD"

            self._respond(200, {
                "ticker": ticker,
                "price": float(price),
                "currency": str(currency),
            })
        except Exception as e:
            self._respond(500, {"error": str(e)})

    def _respond(self, status, data):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def do_OPTIONS(self):
        self._respond(200, {})

    def log_message(self, format, *args):
        pass
