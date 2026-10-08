# Sprawdzenia Słówko 1.1

## Zaliczone

**50 testów Node**: 21 pierwotnych testów bazy i reguł nauki, 7 testów
service workera oraz 22 nowe testy TXT.

Nowe testy obejmują pełną bazę TXT (366 fiszek, 17 działów), zachowanie
oryginalnych identyfikatorów/odpowiedzi/metadanych, warianty odpowiedzi,
UTF-8 BOM, CRLF, komentarze, brak działu, błędne linie i limity rozmiaru,
duplikaty, stabilność identyfikatorów, round-trip eksport/import, zachowanie
postępu, usuwanie wyłącznie wyników nieobecnych fiszek, walidację kopii,
wskazówki dla niejednoznacznych haseł i bezpieczne traktowanie tekstu HTML.

**12 pierwotnych scenariuszy izolowanego UI Chromium**: reguły odpowiedzi,
wykluczanie opanowanych fiszek, reset, kopie, wyszukiwanie, zakresy, zakończenie
nauki oraz układy mobilne.

**14 nowych scenariuszy izolowanego UI Chromium**:

- Przejście ze stanu wersji 1.0 do nowej listy bez utraty wyników.
- Ponowny import nie powiela fiszek ani nie nadpisuje ich działów.
- Błędny TXT i pliki inne niż UTF-8 są odrzucane bez częściowego zapisu.
- Wybór pliku z BOM/CRLF, ręczna edycja i unieważnianie starego podglądu.
- Odtworzenie sesji z zaimportowanymi hasłami i uznawanie alternatyw.
- Nowa fiszka po błędzie wraca, a po poprawnej odpowiedzi znika z puli.
- Eksport TXT całej bazy i tylko prywatnych haseł.
- Nowa kopia JSON przenosi wyniki i hasła do pustej sesji.
- Usuwanie importu wymaga potwierdzenia i nie usuwa wyników oryginalnej bazy.
- Symulowane zdarzenie StorageEvent odświeża słówka i wyniki.
- Ciągi podobne do HTML nie są interpretowane jako znaczniki.
- Okno TXT nie ma przepełnienia poziomego przy szerokościach 320, 360, 375,
  390, 430 i 768 pikseli; obejrzano zrzuty desktop/mobile.
- Przy blokadzie zapisu pojawia się ostrzeżenie, a nauka nadal działa.
- Brak nieobsłużonych błędów JavaScript w sprawdzonych przebiegach.

## Ograniczenia - ważne

W tym środowisku Chromium blokuje nawigację do localhost:
`net::ERR_BLOCKED_BY_ADMINISTRATOR`. Podjęto próbę pełnego testu
`tests/browser_test.py`, ale nie mógł się rozpocząć. NIE jest raportowany
jako zaliczony.

Testy UI wykonano na HTML załadowanym przez Playwright `set_content`.
LocalStorage jest podstawioną pamięcią sesji, a pobieranie plików jest
przechwycone. To sprawdza zawartość pliku i logikę zapisu/odczytu, ale
nie rzeczywisty zapis na dysku ani systemowy interfejs plików Safari.
Wybór pliku wykorzystuje testowy obiekt File; dekodowanie danych i walidacja
wykonują się rzeczywiście w przeglądarce.

Testy service workera to symulacja fetch/CacheStorage w Node, nie pełny cykl
życia PWA. Nie wykonano testu na fizycznym iPhonie ani publikacji na koncie
GitHub/Cloudflare użytkownika. Nie ma nowego publicznego adresu aplikacji.

## Polecenia

```bash
node tools/build.cjs
node --test tests/*.test.cjs
python3 tests/ui_harness.py
python3 tests/txt_ui_harness.py
```

Testy UI wymagają Playwright i Chromium. W środowisku bez blokady adresów
uruchom serwer: `python3 -m http.server 8765 --directory public`, a potem
`python3 tests/browser_test.py`. Te pełne testy dotyczą bazowych przepływów;
nowe funkcje TXT mają oddzielny izolowany zestaw powyżej.

## Kontrola po wdrożeniu

Na swoim telefonie wczytaj `przyklad-slowka.txt`, zalicz jedną fiszkę,
odpowiedz błędnie na drugą, zamknij i otwórz aplikację. Sprawdź liczbę
haseł i wyniki. Wyeksportuj TXT oraz kopię JSON i odtwórz kopię.
Po komunikacie "Gotowe offline" sprawdź działanie w trybie samolotowym.
Dopisz hasło w repozytorium do `data/slowka.txt`, opublikuj i sprawdź
jego obecność po odświeżeniu bez zerowania starego postępu.
