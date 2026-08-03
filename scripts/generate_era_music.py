#!/usr/bin/env python3
"""Generate seven original, deterministic looping era scores as PCM WAV files.

The compositions are intentionally synthesized from code so the repository owns
the complete, reproducible musical source and does not depend on licensed music.
"""
from __future__ import annotations

from array import array
import math
from pathlib import Path
import wave

SAMPLE_RATE = 22_050
TAU = math.tau

TRACKS = [
    dict(id='primitive', title='Dawn of the First Hearth', bpm=76, root=50, scale=[0, 3, 5, 7, 10],
         melody=[0, 2, 1, 3, 2, 4, 3, 1, 0, 1, 2, 0, 3, 2, 1, 0], timbre='flute', drum=1.0),
    dict(id='ancient', title='Rivers Crown the Bronze', bpm=84, root=52, scale=[0, 1, 4, 5, 7, 8, 11],
         melody=[0, 2, 4, 3, 1, 2, 5, 4, 3, 1, 0, 2, 4, 6, 5, 3], timbre='reed', drum=.82),
    dict(id='classical', title='Roads of Marble and Iron', bpm=92, root=50, scale=[0, 2, 3, 5, 7, 9, 10],
         melody=[0, 2, 4, 5, 4, 2, 1, 3, 5, 6, 4, 2, 3, 1, 0, 2], timbre='strings', drum=.72),
    dict(id='medieval', title='Banners beyond the Keep', bpm=88, root=50, scale=[0, 2, 3, 5, 7, 8, 10],
         melody=[0, 4, 3, 2, 1, 3, 5, 4, 2, 0, 1, 4, 3, 2, 1, 0], timbre='lute', drum=.74),
    dict(id='exploration', title='Sails across an Unwritten Sea', bpm=102, root=55, scale=[0, 2, 4, 5, 7, 9, 11],
         melody=[0, 2, 4, 6, 5, 4, 2, 3, 5, 1, 2, 4, 3, 1, 0, 4], timbre='fife', drum=.86),
    dict(id='early_modern', title='Engines beneath the Standard', bpm=108, root=51, scale=[0, 2, 3, 5, 7, 8, 11],
         melody=[0, 3, 4, 2, 5, 4, 6, 3, 2, 5, 1, 4, 3, 2, 1, 0], timbre='brass', drum=.95),
    dict(id='modern', title='A World in Motion', bpm=116, root=50, scale=[0, 2, 3, 5, 7, 9, 10],
         melody=[0, 4, 2, 5, 3, 6, 4, 1, 2, 5, 0, 3, 4, 2, 1, 0], timbre='hybrid', drum=.9),
]


def midi(note: int) -> float:
    return 440.0 * (2.0 ** ((note - 69) / 12.0))


def oscillator(kind: str, phase: float) -> float:
    if kind == 'flute':
        return .86 * math.sin(phase) + .12 * math.sin(2 * phase) + .02 * math.sin(4 * phase)
    if kind == 'reed':
        return .64 * math.sin(phase) + .24 * math.sin(2 * phase) + .12 * math.sin(3 * phase)
    if kind == 'strings':
        return .58 * math.sin(phase) + .25 * math.sin(2 * phase) + .11 * math.sin(3 * phase) + .06 * math.sin(5 * phase)
    if kind == 'lute':
        return .7 * math.sin(phase) + .2 * math.sin(2 * phase) + .1 * math.sin(4 * phase)
    if kind == 'fife':
        return .72 * math.sin(phase) + .18 * math.sin(3 * phase) + .1 * math.sin(5 * phase)
    if kind == 'brass':
        return .55 * math.sin(phase) + .27 * math.sin(2 * phase) + .12 * math.sin(3 * phase) + .06 * math.sin(4 * phase)
    return .6 * math.sin(phase) + .18 * math.sin(2 * phase) + .12 * math.sin(3 * phase) + .1 * math.sin(.5 * phase)


def render(track: dict, output: Path) -> None:
    beats_per_bar = 4
    bars = 16
    seconds_per_beat = 60.0 / track['bpm']
    duration = bars * beats_per_bar * seconds_per_beat
    sample_count = int(duration * SAMPLE_RATE)
    progression = [0, 3, 4, 2]
    data = array('h')

    for index in range(sample_count):
        t = index / SAMPLE_RATE
        beat = t / seconds_per_beat
        half_step = int(beat * 2)
        note_degree = track['melody'][half_step % len(track['melody'])]
        octave = 12 if (half_step // len(track['melody'])) % 4 == 3 else 0
        note = track['root'] + track['scale'][note_degree] + octave
        frequency = midi(note)
        local_half = (beat * 2) % 1.0
        if track['timbre'] == 'lute':
            lead_envelope = min(1.0, local_half * 22) * math.exp(-3.6 * local_half)
        else:
            lead_envelope = min(1.0, local_half * 12) * (.72 + .28 * math.cos(math.pi * local_half))
        lead = oscillator(track['timbre'], TAU * frequency * t) * lead_envelope

        bar = int(beat // beats_per_bar)
        chord_degree = progression[bar % len(progression)]
        chord_root = track['root'] - 12 + track['scale'][chord_degree]
        chord = 0.0
        for interval, gain in ((0, .52), (3, .26), (7, .22)):
            chord += math.sin(TAU * midi(chord_root + interval) * t) * gain
        chord *= .32 * (0.82 + .18 * math.sin(TAU * t / (seconds_per_beat * 8)))
        bass = math.sin(TAU * midi(chord_root - 12) * t) * .34

        local_beat = beat % 1.0
        kick = math.sin(TAU * (64 - 24 * local_beat) * t) * math.exp(-14 * local_beat)
        half_beat = (beat * 2) % 1.0
        noise = math.sin(TAU * (1700 + 137 * math.sin(index * .013)) * t)
        shaker = noise * math.exp(-18 * half_beat) * (.3 if half_step % 2 else .18)
        marching = 0.0
        if track['id'] in ('early_modern', 'modern') and int(beat) % 4 in (1, 3):
            marching = noise * math.exp(-20 * local_beat) * .22

        section = (bar // 4) % 4
        lead_gain = (.58, .74, .82, .68)[section]
        percussion_gain = track['drum'] * (.18, .24, .28, .22)[section]
        sample = lead * lead_gain + chord + bass + (kick * .42 + shaker + marching) * percussion_gain

        edge = min(t / .12, (duration - t) / .12, 1.0)
        sample *= max(0.0, edge) * .52
        data.append(max(-32767, min(32767, int(sample * 32767))))

    output.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(output), 'wb') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(SAMPLE_RATE)
        wav.writeframes(data.tobytes())
    print(f"{track['id']}: {track['title']} -> {output} ({duration:.1f}s)")


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    for track in TRACKS:
        render(track, root / 'assets' / 'audio' / 'bgm' / f"era-{track['id']}.wav")


if __name__ == '__main__':
    main()
