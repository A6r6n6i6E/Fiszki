# Słówko 1.3 — pełna paczka

Ta paczka zawiera cały projekt, nie tylko aktualizację.
Nie wymaga plików z poprzednich paczek. Baza startowa: 461 fiszek,
20 działów i 3 strony (215 + 151 + 95). Zachowany mobilny widok,
import/eksport TXT, filtry stron i działów, zapis lokalny i obsługa offline.

## Publikacja bez kasowania repozytorium

1. Zapisz kopię JSON z ustawieniami i wynikami w dotychczasowej aplikacji.
   Zachowaj też własne zmiany w pliku TXT na GitHubie, jeżeli je dodawałeś.
2. Rozpakuj ZIP. W głównym katalogu repozytorium na GitHubie użyj
   Add file > Upload files i prześlij CAŁY folder `slowko-start`.
   Nie sam ZIP, nie samą zawartość folderu, nie do podfolderu `public`.
3. Na GitHubie poprawne ścieżki to:
   `slowko-start/package.json`, `slowko-start/tools/build.cjs`,
   `slowko-start/data/slowka.txt`, `slowko-start/public/index.html`.
   Stare pliki obok folderu `slowko-start` mogą zostać; nie są używane
   przez skrypt tej paczki.
4. Zapisz na gałęzi produkcyjnej, zwykle `main`.
5. W istniejącym projekcie Cloudflare Pages, w ustawieniach budowania, wpisz:
   - Root directory: `slowko-start`
   - Build command: `node tools/build.cjs`
   - Build output directory: `public`
   - Framework preset: `None` (jeśli pole jest dostępne)
   - Production branch: ta sama gałąź, na którą przesłałeś folder.
   Uwaga: output to `public`, a nie `slowko-start/public`.
6. Po zapisaniu ustawień wywołaj nowe wdrożenie: np. dopisz na GitHubie
   pusty wiersz w `slowko-start/START.txt` i zapisz zmianę bezpośrednio
   na gałęzi produkcyjnej. Sprawdź, czy integracja GitHub jest połączona
   i automatyczne wdrożenia są włączone. Przy niestandardowych filtrach
   Build watch paths nowy folder musi być objęty publikacją.
7. W Deployments sprawdź właśnie najnowszy commit, nie zielony znacznik
   przy starszym wdrożeniu. Log poprawnej bazy startowej zawiera:

   `PELNA-PACZKA-1.3 | 461 fiszek | 3 strony | sprawdz /wersja.json`

   `Ready: 461 cards, 20 categories, 3 pages. Cache: ...`

8. Po udanej publikacji otwórz `/wersja.json` pod dotychczasową domeną.
   Widać tam `wydanie`, `liczbaFiszek`, `liczbaStron`, podział na strony
   i identyfikator commita z Cloudflare. Dla bazy tej paczki oczekuj
   PELNA-PACZKA-1.3 / 461 / 3. To plik publiczny, bez wyników nauki.
   Brak pliku lub sama stara aplikacja zamiast niego oznaczają, że ta
   odpowiedź nie potwierdza nowego wdrożenia.
9. Testuj pierwsze otwarcie w NOWEJ sesji incognito po zamknięciu wszystkich
   starych okien incognito. Nie zapisuj tam docelowych wyników.
   W aplikacji wybierz Wszystkie strony i Wszystkie działy.
   Jeżeli incognito działa, a normalne okno nie: Ctrl+Shift+R (Windows),
   pozostaw aplikację online, zamknij wszystkie jej karty i otwórz ponownie.
   Nie czyść Local Storage ani wszystkich danych witryny.

Domena aplikacji się nie zmienia: zmieniasz katalog źródłowy budowania,
nie adres strony. Paczka zachowuje dotychczasowy identyfikator zapisu wyników.
Wyniki są przypisane do przeglądarki i domeny, a nie do konta GitHub.
Ta paczka sama nie zmienia GitHuba ani ustawień Cloudflare.

## Dalsza edycja słówek

Po tej zmianie aktywny plik w repozytorium to:
`slowko-start/data/slowka.txt`.
Stary `data/slowka.txt` w głównym katalogu nie będzie już używany.

Format UTF-8: `polski;angielski;dział;strona`.
Dopuszczalne odpowiedzi rozdziela `|`. Wpisanie nowej nazwy strony tworzy filtr.
Plik `data/words.json` jest pomocniczą bazą identyfikatorów. Nie zastępuje TXT.
Prywatny import TXT w aplikacji dodaje fiszki na danym urządzeniu,
nie zmienia repozytorium. Eksport JSON służy do kopii wyników i prywatnych fiszek.

## Uruchomienie i testy na komputerze

W folderze `slowko-start`:

```sh
node tools/build.cjs
npm test
python3 -m http.server 8080 --directory public
```

Node >=18; budowanie nie wymaga pobierania bibliotek npm.
Aplikację lokalną otwierasz pod `http://localhost:8080/`.
Plik `slowko-demo.html` działa też samodzielnie na komputerze; nie rejestruje
modułu offline. Do publikacji używaj `public`, nie pliku demonstracyjnego.

Test przeglądarkowy opcjonalnie wymaga Python, Playwright i Chromium:
`python tests/pages_browser_test.py`. Domyślny tryb jest izolowany
(z symulowanym zapisem lokalnym). Tryb rzeczywistego HTTP:
`SLOWKO_HTTP=1 python tests/pages_browser_test.py`.
Zobacz TESTY.md: raport określa faktycznie uruchomione testy.

## Dokumentacja usług

- Cloudflare: https://developers.cloudflare.com/pages/configuration/build-configuration/
- Logi: https://developers.cloudflare.com/pages/configuration/debugging-pages/
- GitHub upload: https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository
- Chrome cache/offline: https://developer.chrome.com/docs/workbox/improving-development-experience/
