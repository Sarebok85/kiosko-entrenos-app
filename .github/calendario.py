#!/usr/bin/env python3
"""Calendarios de iCloud -> eventos.json para el kiosko.

Corre en el workflow del repo de Pages (publica.py lo copia a .github/calendario.py),
cada 30 minutos: iCloud no manda cabeceras CORS y el navegador no puede leer el .ics.

    CALENDARIOS="Alvaro=webcal://...\nFamilia=webcal://..." python calendario.py
    python calendario.py --test

Las URL van en el secret CALENDARIOS, una por linea, `Nombre=url`: quien tiene la URL
lee el calendario, asi que nunca al codigo.
"""
import datetime as dt
import json
import os
import sys
import urllib.request
from zoneinfo import ZoneInfo

import icalendar
import recurring_ical_events

ZONA = ZoneInfo("Europe/Madrid")
ATRAS, ADELANTE = 40, 70     # dias: el mes que se ve y la flecha de un mes a cada lado


def eventos(ics: bytes, calendario: str, desde: dt.date, hasta: dt.date) -> list[dict]:
    """Los eventos de un .ics entre dos fechas, con las repeticiones ya expandidas."""
    sale = []
    for e in recurring_ical_events.of(icalendar.Calendar.from_ical(ics)).between(desde, hasta):
        ini, fin = e.get("DTSTART").dt, (e.get("DTEND") or e.get("DTSTART")).dt
        todo_el_dia = not isinstance(ini, dt.datetime)
        if not todo_el_dia:
            # sin zona en el .ics = hora local; con zona, se pasa a la de Madrid
            ini = ini.astimezone(ZONA) if ini.tzinfo else ini.replace(tzinfo=ZONA)
            fin = fin.astimezone(ZONA) if fin.tzinfo else fin.replace(tzinfo=ZONA)
        sale.append({
            "cal": calendario,
            "titulo": str(e.get("SUMMARY") or "(sin título)"),
            "lugar": str(e.get("LOCATION") or ""),
            "todo_el_dia": todo_el_dia,
            # "AAAA-MM-DD" o "AAAA-MM-DDTHH:MM": el kiosko compara cadenas
            "inicio": ini.isoformat()[:10] if todo_el_dia else ini.strftime("%Y-%m-%dT%H:%M"),
            # en los de todo el dia DTEND es el dia siguiente, exclusivo
            "fin": (fin - dt.timedelta(days=1)).isoformat()[:10] if todo_el_dia and fin > ini
                   else fin.isoformat()[:10] if todo_el_dia else fin.strftime("%Y-%m-%dT%H:%M"),
        })
    return sale


def main():
    hoy = dt.datetime.now(ZONA).date()
    desde, hasta = hoy - dt.timedelta(days=ATRAS), hoy + dt.timedelta(days=ADELANTE)
    todos, fallos = [], []
    for linea in os.environ.get("CALENDARIOS", "").splitlines():
        if "=" not in linea:
            continue
        nombre, url = (x.strip() for x in linea.split("=", 1))
        try:
            req = urllib.request.Request(url.replace("webcal://", "https://", 1),
                                         headers={"User-Agent": "kiosko-run-ai"})
            with urllib.request.urlopen(req, timeout=30) as r:
                todos += eventos(r.read(), nombre, desde, hasta)
        except Exception as e:      # un calendario caido no tumba a los demas ni al despliegue
            fallos.append(nombre)
            print(f"aviso: no he podido leer el calendario {nombre}: {type(e).__name__}", file=sys.stderr)
    todos.sort(key=lambda e: (e["inicio"], e["titulo"]))
    with open("eventos.json", "w", encoding="utf-8") as f:
        json.dump({"generado": dt.datetime.now(ZONA).isoformat(timespec="minutes"),
                   "fallos": fallos, "eventos": todos}, f, ensure_ascii=False)
    print(f"eventos.json: {len(todos)} eventos de {desde} a {hasta}" + (f" · fallan: {fallos}" if fallos else ""))


def test():
    ics = b"""BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:a
DTSTART;TZID=Europe/Madrid:20261012T190000
DTEND;TZID=Europe/Madrid:20261012T200000
RRULE:FREQ=WEEKLY;COUNT=3
SUMMARY:Pilates
END:VEVENT
BEGIN:VEVENT
UID:b
DTSTART;VALUE=DATE:20261017
DTEND;VALUE=DATE:20261019
SUMMARY:Boda
END:VEVENT
BEGIN:VEVENT
UID:c
DTSTART:20261013T080000Z
DTEND:20261013T090000Z
SUMMARY:Medico
END:VEVENT
END:VCALENDAR"""
    ev = eventos(ics, "Alvaro", dt.date(2026, 10, 1), dt.date(2026, 10, 31))
    pil = [e for e in ev if e["titulo"] == "Pilates"]
    assert [e["inicio"] for e in pil] == ["2026-10-12T19:00", "2026-10-19T19:00", "2026-10-26T19:00"], pil
    boda = next(e for e in ev if e["titulo"] == "Boda")
    assert boda["todo_el_dia"] and (boda["inicio"], boda["fin"]) == ("2026-10-17", "2026-10-18"), boda
    assert next(e for e in ev if e["titulo"] == "Medico")["inicio"] == "2026-10-13T10:00"   # UTC -> Madrid
    print("ok")


if __name__ == "__main__":
    test() if sys.argv[1:] == ["--test"] else main()
