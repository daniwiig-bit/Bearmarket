# BearMarket — Short-portefølje tracker

Spor selskapene du ikke tror på, og sammenlign mot long-porteføljen din.

## Kom i gang

### 1. Installer avhengigheter
```bash
npm install
```

### 2. Kjør lokalt
```bash
npm start
```
Åpnes på http://localhost:3000

### 3. Deploy til Vercel (anbefalt)

**Alternativ A — Via GitHub (enklest)**
1. Push mappen til et GitHub-repo
2. Gå til [vercel.com](https://vercel.com) og logg inn
3. Klikk "Add New Project" → velg ditt repo
4. Vercel oppdager React automatisk — klikk bare "Deploy"
5. Ferdig! Du får en URL på format `ditt-prosjekt.vercel.app`

**Alternativ B — Via Vercel CLI**
```bash
npm install -g vercel
vercel
```
Følg instruksjonene i terminalen.

## Funksjoner

- **Short-portefølje**: Legg inn selskaper du er negativ til. Faller aksjen 10% → du "tjener" 10%
- **Long-portefølje**: Normale aksjer du følger
- **Oversikt**: Sammenlign ytelsen mellom de to porteføljene
- **Live priser**: Henter faktiske kurser fra Yahoo Finance (NASDAQ, NYSE, Oslo Børs)
- **Oppdater priser**: Klikk "↻ oppdater priser" for å hente ferske kurser
- **Lokal lagring**: Porteføljene dine lagres i nettleseren (localStorage)

## Ticker-eksempler

| Selskap | Ticker | Børs |
|---------|--------|------|
| Equinor | EQNR | Oslo Børs |
| NEL | NEL | Oslo Børs |
| Apple | AAPL | NASDAQ |
| Tesla | TSLA | NASDAQ |
| Ford | F | NYSE |

## Merknad om priser

Appen bruker Yahoo Finance sitt åpne API. Prisene er forsinket 15-20 min og kan av og til feile for enkeltaksjer. Sjekk at ticker og børs stemmer hvis du får feilmelding.
