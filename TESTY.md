# Weryfikacja Słówko 1.3 - 14.10.2026

## Wykonane

**81 testów Node: wszystkie zaliczone.** Polecenie: `npm test`.

Zachowano 61 testów poprzedniej logiki/formatu/obsługi offline i dodano 20 testów
podziału na strony. Starsze testy danych korzystają z jawnych fixtures poprzedniej bazy;
nowe testy sprawdzają rzeczywistą, zbudowaną bazę 461 fiszek.

Sprawdzono m.in. dokładne liczby 215/151/95, komplet identyfikatorów, przecięcie
filtrów, zachowanie starych wyników, czwartą kolumnę TXT, eksport/import stron,
nowe strony, brak przypisania, walidację, duplikaty, reset zakresu i kolejki nauki.
Testy modułu offline używają m.in. odpowiedzi rzeczywistego lokalnego serwera HTTP
z przekierowaniem, ale zdarzenia service workera są symulowane w Node.

**33 scenariusze izolowanego interfejsu Chromium: wszystkie zaliczone.**

- `tests/mobile_layout_ui.py`: 18 scenariuszy układu i obsługi nauki.
- `tests/pages_browser_test.py`: 15 scenariuszy wyboru stron, zapisu, TXT i JSON.

Sprawdzono widok pytania, błędu i przyciski; obydwa filtry na dole; przechodzenie
między stronami; działy wspólne dla dwóch stron; bazę słówek; nowe strony
z importu; eksport/wczytanie rzeczywistego pliku JSON; usuwanie importu i zakresowy reset.
Stan localStorage oraz ponowne otwarcie dokumentu są symulowane w pamięci przeglądarki.

Test układu objął wszystkie 461 haseł z panelem błędnej odpowiedzi przy
320 x 568, 360 x 640 i 412 x 710 CSS px: bez przewijania strony ani wnętrza karty.
Dodatkowo sprawdzono m.in. 360 x 540, 375 x 667, 390 x 664, 430 x 780,
symulowany mniejszy viewport klawiatury i obrót ekranu. Długie dowolne własne
hasła mogą przewijać wnętrze karty; przycisk Następne pozostaje poza tą treścią.

## Ograniczenia

Nie testowano na fizycznym telefonie, natywnej klawiaturze, Safari, Samsung Internet
ani na koncie Cloudflare użytkownika. Nie publikowano zmian.

Próba rzeczywistej nawigacji Chromium do lokalnego serwera HTTP została zablokowana
przez politykę środowiska (ERR_BLOCKED_BY_ADMINISTRATOR). Blokada nastąpiła przed
załadowaniem kodu aplikacji; nie uznano tych testów za zaliczone. Weryfikacja interfejsu została wykonana przez
set_content, a natywne testy service workera/offline pominięto. To nie potwierdza
rzeczywistego zachowania cache po wdrożeniu.

## Powtórzenie

```sh
node tools/build.cjs
npm test
python tests/mobile_layout_ui.py
python tests/pages_browser_test.py
```

Testy Python wymagają Playwright i Chromium. Ścieżkę do przeglądarki można podać
w CHROMIUM_PATH. Zrzuty i raporty zapisują się w katalogu tymczasowym lub SLOWKO_TEST_OUT.
Na komputerze, którego przeglądarka może otwierać localhost, dodatkowy tryb HTTP:

```sh
SLOWKO_HTTP=1 python tests/pages_browser_test.py
```

Ten tryb sprawdza natywny localStorage, przekierowanie index.html i offline service worker.
W tym środowisku nie został zaliczony z powodu opisanej blokady nawigacji.
