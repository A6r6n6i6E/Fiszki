# Słówko 1.1 - nauka angielskiego + baza TXT

Gotowa aplikacja statyczna: polskie hasło -> odpowiedź wpisana po angielsku.
W tej paczce: 366 fiszek w 17 działach z przesłanych zdjęć.
Nowe słówka można dopisywać w pliku TXT lub importować w aplikacji.

## Jak działa nauka

Jedna poprawna odpowiedź oznacza opanowanie fiszki i wyklucza ją z dalszego
losowania. Błąd lub przycisk "Nie wiem" pokazuje rozwiązanie, a fiszka wraca
w losowym miejscu kolejki. Gdy dostępne są inne karty, nie wraca natychmiast.
Wielkość liter i nadmiar spacji nie mają znaczenia; literówki nie są zaliczane.
Działają filtrowanie działów, wyszukiwarka, statystyki, reset i kopie postępu.

## Dwa sposoby korzystania z TXT

### 1. Wspólna baza projektu: data/slowka.txt

To główny plik listy słówek. Zawiera wszystkie 366 fiszek ze zdjęć.
Dopisuj wiersze, zachowując dotychczasową zawartość. Nie trzeba edytować JavaScriptu.

```text
# polski;angielski;dział
jabłko;apple;Jedzenie
podróż;journey | trip;Podróże
uczyć się;learn
```

Format: jedno polskie hasło, średnik, jedna lub kilka angielskich odpowiedzi.
Opcjonalnie kolejny średnik i nazwa działu. Alternatywy oddziel znakiem `|`.
Brak działu lub puste trzecie pole daje dział "Własne słówka".
Puste wiersze i komentarze zaczynające się od `#` są pomijane.
Ukośnik `/` NIE oznacza alternatywy w nowym TXT: użyj `|`.
Nie wpisuj dodatkowych średników w treści pól. Nie dodawaj niezakomentowanego nagłówka.
Plik zapisuj jako zwykły tekst UTF-8 (nie DOCX, RTF ani UTF-16).

Po zmianie pliku uruchom:

```bash
node tools/build.cjs
```

W Cloudflare Pages polecenie wykonuje się podczas publikacji. Przy połączeniu
z GitHubem zmiana `data/slowka.txt` wysłana na gałąź produkcyjną wywołuje
nowe wdrożenie. Po jego zakończeniu odśwież aplikację; gdy działa stara wersja
offline, poczekaj na informację o aktualizacji i odśwież jeszcze raz.
Użytkownik pozostający offline zobaczy nową bazę dopiero po aktualizacji online.

TXT jest źródłem podczas budowania aplikacji. Przeglądarka wczytuje wygenerowany
`public/vocabulary.js`, nie obserwuje na żywo pliku na Twoim dysku.
Plik `data/words.json` jest pomocniczym rejestrem pierwotnych fiszek: zachowuje ich
identyfikatory, wskazówki i informacje o zdjęciach. Zwykle go nie edytuj.
Usunięty z TXT wiersz nie jest automatycznie przywracany z tego rejestru.

### 2. Prywatny import w aplikacji

Wybierz **Dodaj słówka z TXT -> Wybierz plik .txt**, sprawdź podgląd,
a potem naciśnij **Dodaj do nauki**. Można też wpisać lub wkleić wiersze
w polu tekstowym i nacisnąć **Sprawdź listę**.

Import dodaje nowe fiszki bez kasowania istniejących wyników. W przypadku błędnej
linii nic nie jest dodawane: komunikat podaje numer wiersza do poprawienia.
Duplikat to to samo polskie hasło i pierwszy angielski wariant, po normalizacji
wielkości liter, spacji i typografii. Duplikaty są pomijane, a nie aktualizowane:
import nie nadpisuje ich działu ani dopuszczalnych odpowiedzi.

Import jest przechowywany tylko w tej przeglądarce. Nie modyfikuje pliku na GitHubie,
nie synchronizuje się automatycznie między telefonem a komputerem i nie nadpisuje
wybranego pliku TXT. Po dopisaniu linii do lokalnego pliku wybierz go ponownie
w aplikacji; zostaną dodane tylko brakujące fiszki.

Gdy chcesz zastąpić prywatną listę zamiast dodawać do niej, zapisz kopię JSON,
usuń prywatny import i wczytaj poprawiony plik. Usunięcie prywatnego importu
usuwa wyniki tych fiszek, ale nie kasuje bazy projektu i jej wyników.
Do modyfikowania wspólnej bazy bez usuwania postępu pozostałych fiszek służy
edycja `data/slowka.txt` i ponowne wdrożenie.

## Eksport i kopie

W oknie dodawania słówek rozwiń **Zapisz listę do TXT / zarządzaj importem**.
Możesz wyeksportować całą bazę albo tylko hasła dołożone prywatnie.
TXT zawiera słówka, bez stanu opanowania.

**Ustawienia -> Zapisz kopię** tworzy JSON zawierający wyniki ORAZ słówka.
Nowa wersja nadal wczytuje stare kopie 1.0. Nowe kopie z dodatkowymi hasłami
należy wczytywać w wersji 1.1 lub późniejszej. Wczytanie kopii wymaga potwierdzenia.
Dla kopii JSON limit rozmiaru to 6 MB.

## Zachowanie postępu przy aktualizacji

Wersja 1.1 używa tego samego klucza pamięci co 1.0 i zachowuje identyfikatory
wszystkich pierwotnych fiszek. Aktualizuj stronę pod tym samym adresem i nie czyść
jej danych. Przed aktualizacją zapisz kopię JSON i zamknij karty ze starą wersją.
Nowy adres/domena, inna przeglądarka lub inny profil nie dzielą lokalnego zapisu.

Dopisanie nowych wierszy, zmiana ich kolejności lub działu nie zerują postępu.
Identyfikator fiszki zależy od polskiego hasła i PIERWSZEJ angielskiej odpowiedzi.
Zmiana ich znaczenia/treści albo przeniesienie innego wariantu na pierwsze miejsce
może utworzyć nową fiszkę. Samo dopisanie alternatywy po `|` do pliku projektu
zachowuje identyfikator. Wyniki fiszek usuniętych z bazy nie są dalej przechowywane
przy kolejnym zapisie; wyniki pozostałych zostają.

## Limity i dane

Maksymalnie 5000 fiszek w połączonej bazie i do 2 MB tekstu TXT w UTF-8.
Polskie hasło: do 300 znaków. Angielska odpowiedź: do 240 znaków, maksymalnie
16 alternatyw. Nazwa działu: do 80 znaków.

Aplikacja nie wysyła odpowiedzi, prywatnych importów ani postępów na serwer.
Nie wymaga konta ani API. Pamięć lokalna może zostać usunięta przez przeglądarkę
lub użytkownika, dlatego warto robić kopie. Wspólna baza opublikowanej strony jest
publicznie dostępna jako część aplikacji; nie umieszczaj w niej tajnych informacji.

## GitHub -> Cloudflare Pages

Rozpakuj projekt i prześlij zawartość folderu `slowka` do głównego katalogu repozytorium.
Na poziomie głównym mają być `public`, `data`, `tools` i `package.json`.
W już istniejącym repozytorium zastąp pliki nową wersją i dodaj nowe pliki z ZIP.
Nie zmieniaj skonfigurowanych wcześniej poprawnych ścieżek.

Ustawienia Cloudflare Pages:

| Pole | Wartość |
| --- | --- |
| Production branch | main |
| Framework preset | None |
| Build command | node tools/build.cjs |
| Build output directory | public |
| Root directory | puste |

Nie potrzeba `npm install`, backendu ani kluczy API. Błędny TXT przerwie budowanie
z opisem problemu zamiast opublikować uszkodzoną bazę.
Instrukcje dostawcy: https://developers.cloudflare.com/pages/get-started/git-integration/

## Uruchomienie lokalne i iPhone

```bash
node tools/build.cjs
python3 -m http.server 8080 --directory public
```

Otwórz `http://localhost:8080`. Alternatywnie na komputerze otwórz
`slowko-demo.html` bez serwera: ten plik zawiera całą aplikację, import i eksport TXT.
Demo jest generowane przez skrypt budowania, więc po zmianie TXT trzeba je ponownie
wygenerować. Edytowanie sąsiedniego pliku TXT nie zmienia samoistnie dema.

Na iPhonie otwórz opublikowaną stronę w Safari. Można dodać ją do ekranu
głównego z menu udostępniania. Zapis, wybieranie plików i PWA trzeba sprawdzić
na swoim telefonie. Offline jest przygotowywane przy pierwszym otwarciu HTTPS;
stan "Gotowe offline" pojawia się w stopce. Testy w tej paczce NIE są testem
na fizycznym iPhonie ani rzeczywistym wdrożeniu na Cloudflare.

## Testy

```bash
node tools/build.cjs
node --test tests/*.test.cjs
python3 tests/ui_harness.py
python3 tests/txt_ui_harness.py
```

Testy UI wymagają pakietu Python Playwright i Chromium. Domyślna ścieżka
przeglądarki: `/usr/bin/chromium`; można ustawić `CHROMIUM_PATH`.
Dokładny zakres testów i ograniczenia są opisane w `TESTY.md`.
