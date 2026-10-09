# Testy aktualizacji mobilnej 1.2

Sprawdzenia wykonano w tym środowisku, przed przygotowaniem paczki.

## Zaliczone

- 61 testów Node: baza, logika nauki, TXT, service worker i poprzednia
  poprawka nawigacji Cloudflare.
- 12 scenariuszy izolowanego interfejsu: nauka, reset, eksport/import kopii,
  przywracanie wyników i filtrowanie.
- 14 scenariuszy TXT: zachowanie wyników, import, duplikaty, eksport,
  nieprawidłowe dane, bezpieczeństwo tekstu i brak zapisu lokalnego.
- 18 scenariuszy układu mobilnego w Chromium 144.0.7559.96:
  * Widoki pytania, pustego wpisu, błędu, sukcesu i Nie wiem dla
    320x568, 360x540, 360x640, 375x667, 390x664, 412x710 i 430x780.
    To rozmiary obszaru strony w pikselach CSS, nie fizyczna rozdzielczość
    całego telefonu. Pasek przeglądarki jest poza tym obszarem.
  * Każde z 366 haseł bazy ze wskazówkami i panelem błędnej odpowiedzi
    mieści się bez przewijania panelu dla 320x568, 360x640 i 412x710.
    To test renderowania każdego wpisu, nie 1098 osobnych sesji nauki.
  * Dodatkowe wyjaśnienia rozwijane bez utraty dostępu do Następne.
  * Symulacja klawiatury przez zmniejszenie wysokości do 320 px i osobno
    zmianę visualViewport.height do 360 px; powrót do pełnego widoku.
  * Długi prywatny import przewija tylko treść karty; przyciski pozostają
    widoczne. Sprawdzenie kliknięcia przez elementFromPoint, nie tylko
    obecności przycisku w DOM.
  * Przejście do bazy i z powrotem, import, wybór działu, pomoc,
    obrót 844x390 i powrót do portretu, układ komputerowy.
  * Brak nieobsłużonych błędów JavaScript.

Obejrzano zrzuty ekranu pytania, błędnej odpowiedzi i małego telefonu.

## Ograniczenia

Testy przeglądarkowe uruchomiono na dokumencie HTML osadzonym przez
Playwright set_content. Pamięć localStorage jest podstawiona testowo.
Chromium tego środowiska blokuje nawigację do localhost komunikatem
ERR_BLOCKED_BY_ADMINISTRATOR. Nie twierdzimy, że sprawdzono rzeczywistą
stronę użytkownika, zapis na dysku lub pełny cykl offline w przeglądarce.

Nie wykonano testu na fizycznym Samsungu ani iPhonie; w szczególności
zachowanie systemowej klawiatury i pasków Safari/Chrome/Samsung Internet
wymaga kontroli po wdrożeniu. Symulacja viewportu nie zastępuje takiego testu.
Nietypowo duże powiększenie, bardzo długie importy i rozwinięte szczegóły
mogą wymagać przewijania treści wewnątrz karty. Nie blokujemy zoomu.

## Uruchomienie

    node tools/build.cjs
    node --test tests/*.test.cjs
    python3 tests/ui_harness.py
    python3 tests/txt_ui_harness.py
    python3 tests/mobile_layout_ui.py

Testy Python wymagają pakietu Playwright i Chromium. Ścieżkę przeglądarki
można ustawić zmienną CHROMIUM_PATH, katalog wyników przez SLOWKO_TEST_OUT.
Do samego budowania i hostowania aplikacji Playwright nie jest potrzebny.
