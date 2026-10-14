# Słówko 1.3

Aplikacja do ćwiczenia pisowni z polskiego na angielski. Statyczna strona bez backendu,
bez logowania i bez zewnętrznych bibliotek w kodzie aplikacji.

Baza z trzech zdjęć: 461 fiszek, 20 działów, 3 strony. Filtr strony i filtr działu
działają łącznie. Poprawna odpowiedź usuwa fiszkę z puli do nauki; błędna lub
Nie wiem pokazuje odpowiedź i przywraca fiszkę w losowym miejscu kolejki.

Pełna instrukcja aktualizacji, wyboru stron i plików TXT: **AKTUALIZACJA-STRONY.md**.
Wyniki sprawdzenia oraz ograniczenia: **TESTY.md**.

## Pliki

- `data/slowka.txt` - główna lista; edytuj ją, by dodawać lub usuwać hasła.
- `data/words.json` - metadane, podpowiedzi i identyfikatory referencyjne. Nie trzeba
  go zmieniać przy dopisywaniu nowej strony do TXT. Skrypt publikuje tylko wiersze TXT.
- `public/` - pliki strony. `vocabulary.js` i `sw.js` są generowane.
- `tools/build.cjs` - budowanie bez dodatkowych pakietów.
- `slowko-demo.html` - wygenerowana wersja jednoplikowa do podglądu na komputerze.
- `tests/` - testy logiki i interfejsu.

## Budowanie i Cloudflare Pages

```sh
node tools/build.cjs
npm test
```

Ustawienia istniejącego projektu: Build command `node tools/build.cjs`, Build output
directory `public`. Root directory bez zmian. Nie publikuj jako osobny Worker.

Test lokalny na zwykłym komputerze po zbudowaniu:

```sh
python3 -m http.server 8080 --directory public
```

Otwórz w przeglądarce `http://localhost:8080/`.

## Format TXT

```text
# polski;angielski;dział;strona
ławka;bench;Dom i jego okolica;Strona 3
jabłko;apple;Jedzenie;Strona 4
```

Nowe nazwy stron tworzą się automatycznie. Pola dział i strona są opcjonalne.
Dozwolone są 2-4 kolumny, plik UTF-8 do 2 MB i maksymalnie 5000 unikalnych fiszek.
Alternatywne odpowiedzi: znak |. Import lokalny dodaje, nie zastępuje bazy projektu.

## Zapis wyników

Stan pozostaje w localStorage bieżącej przeglądarki. Nie ma synchronizacji z kontem
ani między urządzeniami. Kopia JSON przenosi słówka i wyniki; TXT tylko słówka.
Przed aktualizacją zapisz kopię. Nie czyść danych witryny.

Wewnętrzny identyfikator `czlowiek-01` i klucz `slowko.czlowiek-01.v1` pozostają
celowo takie jak w starszej wersji, aby nie zerować zapisu przy rozszerzeniu bazy.
Czwarta kolumna nie jest częścią identyfikatora fiszki. Zmiana strony lub działu
nie tworzy nowej fiszki; zmiana polskiego hasła albo pierwszej odpowiedzi może ją utworzyć.

Zachowano poprawkę Cloudflare z wersji 1.2. Wersja cache jest hashem plików i generatora.
Nie edytuj samego sw.js: po budowaniu jest tworzony ponownie.
