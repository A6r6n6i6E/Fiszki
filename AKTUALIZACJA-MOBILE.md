# Słówko 1.2: wygodna nauka na telefonie

To aktualizacja istniejącej aplikacji 1.1 z importem TXT, nie osobna aplikacja.
Nie twórz nowego repozytorium ani projektu Cloudflare.
Paczka nie zawiera katalogu data ani pliku public/vocabulary.js, aby nie nadpisać
Twojej listy słówek. Baza zostanie zbudowana z Twojego data/slowka.txt.
Kod nie zmienia klucza zapisu postępu ani identyfikatorów fiszek.

## Co zmieniono

- Na telefonie nauka wykorzystuje widoczną wysokość ekranu. Nagłówek,
  statystyki i odstępy są mniejsze; ozdobny podtytuł ukryto.
- Wybór działu i przycisk Dodaj TXT są w dolnym pasku pod kartą.
- Przyciski Sprawdź i Następne słówko mają stałe miejsce w dolnej
  części karty. Wynik odpowiedzi nie przesuwa ich poza ekran.
- Po sprawdzeniu wynik zastępuje pole wpisywania. Po błędzie widać
  poprawny zapis, wpis użytkownika i informację o powrocie fiszki.
- Dłuższe wyjaśnienia oraz warianty są pod Więcej o odpowiedzi.
- Przy klawiaturze i małej dostępnej wysokości zostaje samo ćwiczenie.
  Po sprawdzeniu aplikacja usuwa fokus z pola odpowiedzi. Następne pytanie
  nie otwiera klawiatury automatycznie; wystarczy dotknąć pola wpisywania.
- Bardzo długie własne hasła mogą przewijać się wewnątrz karty.
  Przyciski pozostają poza jej przewijaną częścią. Baza słówek,
  import i ustawienia nadal mogą się przewijać.
- Układ komputerowy pozostaje dwukolumnowy. Reguły nauki i import TXT
  nie zmieniły się. Zachowano poprzednią poprawkę nawigacji Cloudflare.
- Numer wydania w Ustawienia i pomoc: wersja 1.2.

## Jak wgrać

1. Dla bezpieczeństwa zapisz kopię wyników w aplikacji:
   Ustawienia i pomoc > Zapisz kopię.
2. Rozpakuj ZIP. Na GitHubie przejdź do katalogu projektu, gdzie widać
   foldery public, tools, data i plik package.json. Jeśli są w folderze
   slowka, otwórz go. Wgraj zawartość paczki przez Add file > Upload files.
3. Zastąp pliki o tych samych ścieżkach. Nie usuwaj całych starych
   folderów public ani tools. Nie wgrywaj ZIP jako pojedynczego pliku.
4. Zapisz Commit changes do gałęzi produkcyjnej, zwykle main.
5. W Cloudflare > projekt > Deployments poczekaj na udane nowe wdrożenie.
   Sprawdź, że Source wskazuje nowy commit, nie poprzedni zielony wpis.
6. Otwórz dotychczasowy adres z dostępem do internetu. Zaczekaj, aż
   nowa wersja będzie gotowa, zamknij karty aplikacji i otwórz ponownie.
   W Ustawienia i pomoc sprawdź oznaczenie wersja 1.2.

Nie czyść wszystkich danych witryny: przechowują wyniki i prywatne słówka.
Nie trzeba zmieniać adresu strony ani ustawień budowania:

    Build command: node tools/build.cjs
    Build output directory: public
    Root directory: jak dotychczas

Wgraj wszystkie pliki aktualizacji, zwłaszcza index.html, app.js i styles.css,
ponieważ tworzą wspólny układ. tools/build.cjs zawiera wcześniejszą
poprawkę Cloudflare i generuje nową wersję public/sw.js z hashem plików.
Podpis cache nadal zaczyna się od cf-navfix-1-, ale jego końcówka zmienia się.
Gotowy sw.js dołączony do paczki ma bazę referencyjną; build wygeneruje go
ponownie odpowiednio do Twojej rzeczywistej bazy TXT.

## Pliki aktualizacji

    public/index.html
    public/styles.css
    public/app.js
    public/sw.js
    tools/build.cjs
    package.json
    tests/mobile_layout_ui.py
    tests/service-worker.test.cjs
    tests/cloudflare-navigation.test.cjs
    TESTY-MOBILE.md
    AKTUALIZACJA-MOBILE.md

## Weryfikacja po publikacji na telefonie

Otwórz Nauka i sprawdź, że widzisz dolny wybór działu, Dodaj TXT oraz
Sprawdź bez przewijania strony. Wpisz celowo błędny wyraz: poprawny zapis
oraz Następne słówko mają być widoczne. Sprawdź również włączenie
klawiatury, powrót z Bazy słówek i zachowanie dotychczasowych wyników.

Nie wykonano publikacji na koncie użytkownika. Szczegóły testów i ich
ograniczenia są w TESTY-MOBILE.md.
