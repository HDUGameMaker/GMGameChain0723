#!/usr/bin/env python3
"""Generate deterministic, license-free UI and strategic action cues."""
from __future__ import annotations

import math
import random
import struct
import wave
from pathlib import Path

SAMPLE_RATE = 44_100
OUTPUT_DIRECTORY = Path(__file__).resolve().parents[1] / 'assets' / 'audio' / 'sfx' / 'strategic'


def envelope(time: float, duration: float, attack: float = 0.015, release: float = 0.18) -> float:
    return min(1.0, time / max(attack, 0.001), (duration - time) / max(release, 0.001)) ** 1.35


def render(name: str, duration: float, tones: list[tuple], noises: list[tuple] | None = None) -> None:
    count = round(duration * SAMPLE_RATE)
    samples = [0.0] * count
    for start, length, frequency, amplitude, voice in tones:
        first = max(0, round(start * SAMPLE_RATE))
        last = min(count, round((start + length) * SAMPLE_RATE))
        for index in range(first, last):
            local = index / SAMPLE_RATE - start
            phase = 2 * math.pi * frequency * local
            if voice == 'triangle':
                value = 2 / math.pi * math.asin(math.sin(phase))
            elif voice == 'square':
                value = 1.0 if math.sin(phase) >= 0 else -1.0
            elif voice == 'bell':
                value = math.sin(phase) + 0.45 * math.sin(phase * 2.01) + 0.18 * math.sin(phase * 3.98)
            else:
                value = math.sin(phase)
            samples[index] += value * amplitude * envelope(local, length)
    rng = random.Random(name)
    for start, length, amplitude, color in noises or []:
        first = max(0, round(start * SAMPLE_RATE))
        last = min(count, round((start + length) * SAMPLE_RATE))
        previous = 0.0
        for index in range(first, last):
            local = index / SAMPLE_RATE - start
            white = rng.uniform(-1.0, 1.0)
            previous = previous * color + white * (1.0 - color)
            samples[index] += previous * amplitude * envelope(local, length, 0.002, length * 0.8)
    peak = max(0.001, max(abs(value) for value in samples))
    gain = 0.86 / peak
    pcm = b''.join(struct.pack('<h', round(math.tanh(value * gain) * 30_000)) for value in samples)
    OUTPUT_DIRECTORY.mkdir(parents=True, exist_ok=True)
    with wave.open(str(OUTPUT_DIRECTORY / name), 'wb') as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(SAMPLE_RATE)
        output.writeframes(pcm)


def main() -> None:
    cues = {
        'ui-confirm.wav': (0.18, [(0.00, 0.11, 820, .42, 'bell'), (0.055, 0.11, 1230, .25, 'bell')], []),
        'construction.wav': (0.52, [(0.02, .19, 118, .72, 'triangle'), (.24, .23, 92, .76, 'triangle')], [(0, .16, .7, .15), (.22, .18, .62, .18)]),
        'training.wav': (0.72, [(0.05, .28, 196, .42, 'triangle'), (.22, .35, 294, .38, 'triangle'), (.39, .29, 392, .34, 'bell')], [(0, .18, .38, .45)]),
        'research.wav': (0.82, [(0, .38, 523.25, .30, 'bell'), (.18, .42, 659.25, .30, 'bell'), (.39, .41, 783.99, .32, 'bell')], []),
        'era-fanfare.wav': (1.55, [(0, .62, 196, .28, 'triangle'), (.18, .68, 246.94, .28, 'triangle'), (.40, .70, 293.66, .30, 'triangle'), (.68, .82, 392, .34, 'bell')], [(0, .22, .24, .5), (.62, .30, .18, .4)]),
        'diplomacy.wav': (0.65, [(0.04, .32, 220, .34, 'bell'), (.22, .38, 329.63, .30, 'bell')], [(0, .15, .45, .22)]),
        'trade.wav': (0.66, [(0.02, .19, 1050, .31, 'bell'), (.16, .23, 1320, .30, 'bell'), (.36, .25, 980, .29, 'bell')], []),
        'colony.wav': (1.02, [(0.05, .42, 164.81, .35, 'triangle'), (.27, .52, 220, .34, 'triangle'), (.53, .44, 329.63, .36, 'bell')], [(0, .20, .38, .28)]),
        'wild-victory.wav': (0.88, [(0, .28, 293.66, .29, 'bell'), (.18, .34, 392, .31, 'bell'), (.39, .43, 587.33, .34, 'bell')], [(0, .12, .20, .55)]),
        'battle-resolve.wav': (0.78, [(0, .36, 73.42, .66, 'triangle'), (.12, .31, 146.83, .44, 'square'), (.34, .39, 110, .48, 'triangle')], [(0, .28, .75, .38), (.30, .25, .52, .25)]),
        'hero-recruit.wav': (1.08, [(0, .35, 261.63, .28, 'bell'), (.21, .43, 329.63, .30, 'bell'), (.46, .53, 523.25, .34, 'bell')], []),
        'quest-consequence.wav': (1.20, [(0, .54, 130.81, .35, 'triangle'), (.31, .55, 196, .29, 'bell'), (.63, .51, 261.63, .31, 'bell')], [(0, .26, .24, .65)]),
    }
    for name, (duration, tones, noises) in cues.items():
        render(name, duration, tones, noises)
    print(f'Generated {len(cues)} strategic cues in {OUTPUT_DIRECTORY}')


if __name__ == '__main__':
    main()
