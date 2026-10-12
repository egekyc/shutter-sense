window.Camera = (function () {
  "use strict";

  const APERTURES = [1.2, 1.4, 1.6, 1.8, 2, 2.2, 2.5, 2.8, 3.2, 3.5, 4, 4.5, 5, 5.6, 6.3, 7.1, 8, 9, 10, 11, 13, 14, 16, 18, 20, 22, 25, 29, 32];
  const SHUTTERS = [
    1 / 8000, 1 / 6400, 1 / 5000, 1 / 4000, 1 / 3200, 1 / 2500, 1 / 2000, 1 / 1600, 1 / 1250, 1 / 1000,
    1 / 800, 1 / 640, 1 / 500, 1 / 400, 1 / 320, 1 / 250, 1 / 200, 1 / 160, 1 / 125, 1 / 100,
    1 / 80, 1 / 60, 1 / 50, 1 / 40, 1 / 30, 1 / 25, 1 / 20, 1 / 15, 1 / 13, 1 / 10,
    1 / 8, 1 / 6, 1 / 5, 1 / 4, 0.3, 0.4, 0.5, 0.6, 0.8, 1, 1.3, 1.6, 2, 2.5, 3.2, 4, 5, 6, 8, 10, 13, 15, 20, 25, 30,
  ];
  const ISOS = [50, 64, 80, 100, 125, 160, 200, 250, 320, 400, 500, 640, 800, 1000, 1250, 1600, 2000, 2500, 3200, 4000, 5000, 6400, 8000, 10000, 12800, 16000, 20000, 25600, 32000, 40000, 51200];

  function nearestIndex(scale, v) {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < scale.length; i++) {
      const d = Math.abs(Math.log(scale[i] / v));
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  }

  function fmtAperture(n) {
    return "f/" + Math.round(n * 10) / 10;
  }

  function fmtShutter(t) {
    if (t >= 0.3) return (t < 10 ? Math.round(t * 10) / 10 : Math.round(t)) + "s";
    return "1/" + Math.round(1 / t);
  }

  function fmtIso(iso) {
    return "ISO " + Math.round(iso);
  }


  function ev100(aperture, shutter, iso) {
    return Math.log2((aperture * aperture) / shutter) - Math.log2(iso / 100);
  }


  function stopsOff(kind, guess, actual) {
    const r = Math.abs(Math.log2(guess / actual));
    return kind === "aperture" ? 2 * r : r;
  }


  function points(stops, zeroAt = 3) {
    if (stops <= 0.17) return 100;
    return Math.max(0, Math.round(100 * (1 - stops / zeroAt)));
  }

  const PHONE = /iphone|samsung sm-|xiaomi|oneplus|itel|pixel \d|huawei|redmi|oppo|vivo|nokia|motorola|htc/i;

  function isPhone(camera) {
    return !!camera && PHONE.test(camera);
  }


  function lightLevel(ev) {
    if (ev >= 14) return "bright sunlight";
    if (ev >= 11) return "daylight or overcast sky";
    if (ev >= 8) return "shade, dusk or a bright interior";
    if (ev >= 4) return "a dim interior or a lit city at night";
    if (ev >= 0) return "night with only a little artificial light";
    return "a dark night sky";
  }

  function explain(photo) {
    const { aperture: n, shutter: t, iso } = photo;
    const tips = [];
    if (isPhone(photo.camera)) {
      tips.push({ key: "aperture", text: `${fmtAperture(n)} is a phone's fixed aperture. Phones can't stop down, and their tiny sensors keep most of the scene sharp even though the number is small.` });
    } else if (n <= 2.8) {
      tips.push({ key: "aperture", text: `${fmtAperture(n)} is a wide aperture: a shallow depth of field with a soft, blurry background, and lots of light reaching the sensor.` });
    } else if (n < 8) {
      tips.push({ key: "aperture", text: `${fmtAperture(n)} is a middle aperture: a balance between background blur, sharpness and light.` });
    } else {
      tips.push({ key: "aperture", text: `${fmtAperture(n)} is a narrow aperture: deep focus, sharp from front to back. It's typical for landscapes, architecture and long exposures.` });
    }

    if (t >= 1) tips.push({ key: "shutter", text: `${fmtShutter(t)} is a long exposure. Anything moving (water, cars, clouds, people) smears into streaks, so the camera was on a tripod.` });
    else if (t > 1 / 60) tips.push({ key: "shutter", text: `${fmtShutter(t)} is a slow shutter. It's only sharp handheld with steady hands or stabilisation, and moving things blur.` });
    else if (t > 1 / 1000) tips.push({ key: "shutter", text: `${fmtShutter(t)} is an everyday handheld speed: sharp for still or slow subjects.` });
    else tips.push({ key: "shutter", text: `${fmtShutter(t)} is a fast shutter that freezes action like wings, sports and splashing water. It's also common in bright sun.` });

    if (iso <= 200) tips.push({ key: "iso", text: `ISO ${iso} is the camera's cleanest setting, with no visible grain. There was enough light, or a long exposure.` });
    else if (iso <= 1600) tips.push({ key: "iso", text: `ISO ${iso} is a moderate boost for less light or a faster shutter. There may be slight grain in the shadows.` });
    else tips.push({ key: "iso", text: `ISO ${iso} is high, used because the light was low. Look for speckled grain and muddy shadows.` });

    const ev = ev100(n, t, iso);
    tips.push({ key: "exposure", text: `Together they give EV ${Math.round(ev)}, which fits ${lightLevel(ev)}.` });
    return tips;
  }

  function fmtStops(stops) {
    const thirds = Math.round(stops * 3);
    if (thirds === 0) return "spot on";
    const whole = Math.floor(thirds / 3);
    const frac = ["", "⅓", "⅔"][thirds % 3];
    const text = (whole ? String(whole) : "") + frac;
    return text + (thirds > 3 ? " stops" : " stop") + " off";
  }

  const FORMAT = { aperture: fmtAperture, shutter: fmtShutter, iso: fmtIso };
  const SCALE = { aperture: APERTURES, shutter: SHUTTERS, iso: ISOS };

  return { APERTURES, SHUTTERS, ISOS, SCALE, FORMAT, nearestIndex, fmtAperture, fmtShutter, fmtIso, ev100, stopsOff, points, fmtStops, isPhone, lightLevel, explain };
})();
