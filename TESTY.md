# Sprawdzenie pełnej paczki Słówko 1.3

Data: 2026-10-14.

## Zaliczone w tym środowisku

- Budowanie `node tools/build.cjs`: 461 fiszek, 20 działów, 3 strony.
- `npm test`: 84 testy Node, 84 zaliczone, 0 błędów, 0 pominiętych.
- Wśród nich: kompletność ikon i zasobów wymaganych do instalacji
  offline; zgodność pliku wersja.json z wygenerowaną bazą; budowanie
  w oddzielnym katalogu tymczasowym bez poprzednich paczek oraz bez wcześniej
  wygenerowanych vocabulary.js, sw.js, wersja.json i demo.
- `python tests/pages_browser_test.py`: 15 scenariuszy izolowanego Chromium.
  Filtry stron i działów, odpowiedzi, wykluczanie opanowanych fiszek,
  import/eksport TXT/JSON, symulowana migracja wyników z dom-only 1.2,
  małe ekrany 320x568, 360x640, 390x664, 412x710 i desktop.
  Brak nieobsłużonych błędów JavaScript.

## Ograniczenia

Tryb przeglądarkowy HTTP (`SLOWKO_HTTP=1`) został uruchomiony,
ale środowisko zablokowało pierwszą nawigację do localhost:
`net::ERR_BLOCKED_BY_ADMINISTRATOR`. Nie uznajemy tego testu za zaliczony.
Nie potwierdzono rzeczywistej instalacji modułu offline, migracji istniejącego
cache ani ponownego otwierania na produkcyjnym Cloudflare. Testy Node obejmują
symulowane zdarzenia modułu offline i przekierowania HTTP, a nie pełny
cykl działania na fizycznym urządzeniu.

Test interfejsu korzysta z symulowanego localStorage; nie dowodzi zachowania
zapisów na konkretnym telefonie. Nie sprawdzano fizycznego telefonu.
Nie zmieniono repozytorium ani ustawień Cloudflare użytkownika.
Nie potwierdzono pierwotnej przyczyny jego nieaktualnego wdrożenia.

## Kontrola po publikacji

1. Nowy commit w sekcji Production i udane budowanie z folderu `slowko-start`.
2. Log: `PELNA-PACZKA-1.3 | 461 fiszek | 3 strony`.
3. `/wersja.json`: PELNA-PACZKA-1.3, 461, 3, właściwy commit.
4. W nowej sesji przeglądarki widoczne wszystkie trzy strony, a po ustawieniu
   Wszystkie strony i Wszystkie działy: 461 fiszek.

JSON z wynikami poniżej opisuje tylko testy izolowane:
`tests/reports/pages-test-report.json`.
