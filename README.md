# Tryton Actoom Szczecin — Kappa Career

Przeglądarkowa gra-kariera futsalowa 4+1 osadzona w **XX Kappa Business League**
w Szczecinie. Prowadzisz Tryton Actoom Szczecin: ustawiasz piątkę, wybierasz
taktykę i podejmujesz dziesięć akcji na mecz. Resztę rozgrywa silnik.

Prawdziwe dane: 38 drużyn w czterech ligach, prawdziwe składy z numerami,
herby klubów i terminarz od 16 października 2026, razem z wynikami
rozegranych już kolejek.

## Uruchomienie

Gra jest statyczna — nie potrzebuje serwera ani niczego do zainstalowania.
Wystarczy otworzyć `index.html` w przeglądarce.

Do wygodniejszej pracy można podać pliki przez dowolny serwer statyczny:

```
npx serve .
```

## Hosting dla testerów

Repozytorium jest gotowe pod **GitHub Pages**: katalog główny zawiera
`index.html`, a wszystkie ścieżki są względne. W ustawieniach repozytorium
wystarczy włączyć Pages ze źródłem `main` / `/ (root)`.

Po każdej zmianie podbij numer kompilacji, żeby testerzy nie zostali
na starym kodzie w pamięci przeglądarki:

```
node tools/bump-build.js
```

Numer jest widoczny na ekranie startowym i w nagłówku gry — warto podawać
go przy zgłaszaniu błędów.

## Zapisy

Stan gry trafia do `localStorage` przeglądarki testera pod kluczem
`tryton-kappa-save`. Zapis ma numer wersji (`SAVE_VERSION` w
`src/engine/core.js`). Gdy zmieni się struktura stanu, podbij ten numer —
stary zapis nie zostanie wtedy wczytany, a gracz dostanie czytelny komunikat
i przycisk do skasowania zapisu zamiast rozsypanej gry.

## Struktura

```
index.html              punkt wejścia, numer kompilacji i cache busting
src/data/attributes.js  24 atrybuty futsalowe i wagi pozycyjne
src/data/kappa-data.js  wygenerowane dane ligi (nie edytować ręcznie)
src/engine/core.js      losowość z ziarnem, OVR, generowanie i rozwój zawodników
src/engine/match.js     silnik meczu 4+1: akcje, taktyka, przerwa, interwencje
src/engine/season.js    tabele, symulacja kolejek, awanse i spadki, nowy sezon
src/ui/app.js           wszystkie ekrany
src/styles/app.css      style
src/assets/crests/      herby klubów
tools/build-data.js     zrzuty z Tournify -> src/data/kappa-data.js
tools/bump-build.js     podbicie numeru kompilacji
```

## Przebudowa danych ligi

Dane pochodzą ze zrzutów `scrape-teams.json`, `scrape-schedule.json`
i `played-fixtures.json`, zdjętych ze strony turnieju na Tournify.

```
node tools/build-data.js            # przebuduj dane, herby weź z dysku
node tools/build-data.js --crests   # dodatkowo pobierz brakujące herby
```
