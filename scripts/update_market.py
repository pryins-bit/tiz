#!/usr/bin/env python3
import argparse
import json
import math
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'market.json'

STOCKS = [
    ('삼성전자', '005930.KS'),
    ('SK하이닉스', '000660.KS'),
]


def validate_template():
    data = json.loads(OUT.read_text(encoding='utf-8'))
    got = {(x.get('name'), x.get('symbol')) for x in data.get('stocks', [])}
    expected = set(STOCKS)
    assert expected.issubset(got), f'market.json missing expected stocks: {sorted(expected - got)}'
    print('market.json template OK')


def as_number(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def fetch_quote(name, symbol):
    encoded = urllib.parse.quote(symbol, safe='')
    url = f'https://query1.finance.yahoo.com/v8/finance/chart/{encoded}?range=5d&interval=5m'
    request = urllib.request.Request(
        url,
        headers={
            'User-Agent': 'Mozilla/5.0 SuniTV/1.0',
            'Accept': 'application/json',
        },
    )
    with urllib.request.urlopen(request, timeout=15) as response:
        body = json.load(response)

    result = (((body or {}).get('chart') or {}).get('result') or [None])[0] or {}
    meta = result.get('meta') or {}
    price = as_number(meta.get('regularMarketPrice'))
    previous = as_number(meta.get('chartPreviousClose'))
    if previous is None:
        previous = as_number(meta.get('previousClose'))

    if price is None:
        indicators = ((result.get('indicators') or {}).get('quote') or [{}])[0]
        closes = indicators.get('close') or []
        for value in reversed(closes):
            price = as_number(value)
            if price is not None:
                break

    if price is None:
        raise RuntimeError(f'no market price for {symbol}')

    change_value = None
    change_percent = None
    if previous not in (None, 0):
        change_value = price - previous
        change_percent = change_value / previous * 100

    quote_epoch = meta.get('regularMarketTime')
    quote_time = None
    if quote_epoch:
        quote_time = datetime.fromtimestamp(int(quote_epoch), tz=timezone.utc).isoformat()

    return {
        'name': name,
        'symbol': symbol,
        'price': round(price, 2),
        'change_value': None if change_value is None else round(change_value, 2),
        'change_percent': None if change_percent is None else round(change_percent, 3),
        'quote_time': quote_time,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--validate-template', action='store_true')
    args = parser.parse_args()
    if args.validate_template:
        validate_template()
        return

    results = []
    errors = []
    for name, symbol in STOCKS:
        try:
            results.append(fetch_quote(name, symbol))
        except Exception as exc:
            errors.append(f'{symbol}: {exc}')
        time.sleep(0.4)

    if not results:
        raise SystemExit('all quote fetches failed: ' + '; '.join(errors))

    previous = {}
    if OUT.exists():
        try:
            previous = json.loads(OUT.read_text(encoding='utf-8'))
        except Exception:
            previous = {}
    old_by_symbol = {x.get('symbol'): x for x in previous.get('stocks', []) if x.get('symbol')}
    fresh_by_symbol = {x['symbol']: x for x in results}

    merged = []
    for name, symbol in STOCKS:
        merged.append(fresh_by_symbol.get(symbol) or old_by_symbol.get(symbol) or {
            'name': name,
            'symbol': symbol,
            'price': None,
            'change_value': None,
            'change_percent': None,
            'quote_time': None,
        })

    payload = {
        'updated_at': datetime.now(timezone.utc).isoformat(),
        'source': 'github-actions/yahoo-chart',
        'stocks': merged,
    }
    if errors:
        payload['warnings'] = errors

    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('updated', OUT)
    for stock in merged:
        print(stock['name'], stock['price'], stock['change_percent'])


if __name__ == '__main__':
    main()
