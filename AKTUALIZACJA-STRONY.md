# Słówko 1.3 - wybór stron ze zdjęć

## Co zawiera ta aktualizacja

Dwa niezależne filtry: STRONA ZE ZDJĘCIA i DZIAŁ. Można uczyć się całego
zestawu, jednej strony albo wybranego działu na wybranej stronie. Gdy dział
nie występuje na nowo wybranej stronie, aplikacja przełącza go na wszystkie
działy tej strony i pokazuje krótki komunikat.

| Wybór | Zdjęcie | Fiszki |
| --- | --- | ---: |
| Strona 1 | Człowiek, pierwsze zdjęcie | 215 |
| Strona 2 | Człowiek, drugie zdjęcie | 151 |
| Strona 3 | Dom i okolica, trzecie zdjęcie | 95 |
| Wszystkie strony | Wszystkie trzy zdjęcia | 461 |

To numery zdjęć w kolejności przesłania, nie numery stron podręcznika.
Baza ma 20 działów. Aktualizacja przywraca oba zdjęcia rozdziału Człowiek
obok ostatniej bazy Dom. Nie trzeba już wymieniać pliku przy zmianie materiału.

Na telefonie oba filtry są na dole. Import TXT jest przyciskiem z ikoną strzałki
w górę. Główne przyciski pozostały poza przewijaną treścią karty.
W bazie słówek filtry działają tak samo jak podczas nauki.

## Jak wgrać do istniejącego repozytorium

1. Zapisz kopię JSON wyników w ustawieniach aplikacji. Dodatkowe zmiany dopisane
   samodzielnie w pliku projektu zachowaj też w osobnej kopii TXT.
2. Rozpakuj paczkę. Wgraj JEJ ZAWARTOŚĆ do folderu repozytorium, w którym już
   znajdują się public, data, tools i package.json. Nie twórz nowego poziomu folderów.
   Nadpisz dostarczone pliki. Nie usuwaj całych starych katalogów ani ikon.
3. Wgraj całą aktualizację, nie tylko TXT. Starszy parser nie obsługuje czwartej kolumny.
   Zapisz commit na gałęzi produkcyjnej (zwykle main).
4. Sprawdź w Cloudflare, czy w Deployments zakończyło się nowe wdrożenie tego commita.
   Połączenie z GitHubem musi być aktywne.
5. Otwórz aplikację online. Gdy przygotuje nową wersję, zamknij jej karty i otwórz
   ponownie. W ustawieniach powinno być: wersja 1.3. Nie czyść danych witryny.

Build command: `node tools/build.cjs`

Build output directory: `public`

Root directory: pozostaje taki jak dotychczas.

Plik data/slowka.txt w tej paczce ZASTĘPUJE bazę projektu zestawem z trzech zdjęć.
Nie dopisuj go za pomocą przycisku Dodaj TXT jako sposobu aktualizacji aplikacji.
Prywatne importy pozostają na swoim urządzeniu; nie są plikami na GitHubie.
Nie zmieniono bezpośrednio repozytorium ani wdrożenia użytkownika.

## Postęp

Wybranie strony lub działu nie zeruje wyników. Liczniki dotyczą aktualnego zakresu.
Fiszka opanowana na stronie 3 pozostaje opanowana również przy wyborze wszystkich stron.
Reset zakresu dotyczy wyłącznie wybranej kombinacji strony i działu.
Reset wszystkich postępów nadal dotyczy całej kolekcji.

Zachowano identyfikatory wszystkich 366 dawnych fiszek Człowiek i 95 fiszek Dom.
Istniejące wyniki zachowanych fiszek zostają przy tym samym adresie strony i zapisie
przeglądarki. Jeśli wyniki starych, usuniętych wcześniej fiszek zostały już
skasowane, ta aktualizacja ich nie odtworzy; potrzebna byłaby wcześniejsza kopia JSON.

## Własne strony w TXT

Format jednej linii:

```text
polskie hasło;angielska odpowiedź;dział;strona
```

Przykłady:

```text
ławka;bench;Dom i jego okolica;Strona 3
jabłko;apple;Jedzenie;Strona 4
podróż;journey | trip;Podróże;Strona 4
uczyć się;learn
```

Nowa nazwa (np. Strona 4) utworzy kolejną pozycję wyboru. Może to być także
nazwa własna, np. Kartkówka - jedzenie. Nowe słówko bez strony trafia do
Bez przypisanej strony. Bez działu trafia do Własne słówka. Przykład strony
bez działu: `kot;cat;;Strona 4`.

Dotychczasowe pliki z dwiema lub trzema kolumnami nadal działają. Przy przebudowie
znane fiszki bez czwartej kolumny zachowują stronę z danych referencyjnych. Aby jawnie
usunąć przypisanie, wpisz w czwartej kolumnie: Bez przypisanej strony.

Zapisuj w UTF-8. Puste linie i komentarze zaczynające się od # są pomijane.
Alternatywy odpowiedzi oddziela |. Średnik jest separatorem, nie częścią hasła.

Duplikat to to samo polskie hasło i pierwszy angielski wariant. Import nie przenosi
istniejącej fiszki na inną stronę i nie nadpisuje jej odpowiedzi. Jedna fiszka ma
jedną stronę. Przypisanie istniejącej fiszki zmień w data/slowka.txt i przebuduj
projekt. Samo przeniesienie fiszki do innej strony nie zmienia jej identyfikatora.

Eksport TXT zachowuje przypisanie do strony, a kopia JSON także wyniki i bieżący filtr.
Dodawanie pliku w aplikacji jest lokalne; nie aktualizuje repozytorium.

## Weryfikacja

Zobacz TESTY.md. Nie testowano na fizycznym telefonie ani na wdrożeniu użytkownika.
Dokumentacja automatycznych wdrożeń Cloudflare:
`https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/`
