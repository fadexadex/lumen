/**
 * Browser Live E2E via gstack browse (headless Chromium).
 *
 * Prerequisites: vite (frontend) + agent.py dev.
 * Token minting is same-origin via TanStack Start `/api/lumen-token`.
 *
 * Usage:
 *   B=~/.claude/skills/gstack/browse/dist/browse
 *   node tests/live/browser-e2e.mjs
 *
 * Covers: lesson seed → Live connect (no mic) → canvas ops → text chat →
 * write-on-board → clean stop. Real mic STT still needs a human.
 */
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";

const B =
  process.env.BROWSE ||
  path.join(homedir(), ".claude/skills/gstack/browse/dist/browse");
const APP = process.env.LUMEN_APP_URL || "http://localhost:8080";

function browse(...args) {
  const r = spawnSync(B, args, { encoding: "utf8", timeout: 60000 });
  if (r.error) throw r.error;
  const out = (r.stdout || "").trim();
  const err = (r.stderr || "").trim();
  if (r.status !== 0)
    throw new Error(`browse ${args[0]} failed: ${err || out}`);
  return out;
}

function js(expr) {
  return browse("js", expr);
}

function ok(name, detail) {
  return { name, pass: true, detail };
}
function fail(name, detail) {
  return { name, pass: false, detail };
}

function parseJson(s) {
  const m = s.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!m) throw new Error(`no JSON in: ${s.slice(0, 200)}`);
  return JSON.parse(m[0]);
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  /** @type {Array<{name:string,pass:boolean,detail:string}>} */
  const results = [];

  try {
    browse("goto", `${APP}/`);
    js(`(function(){
      var profile={name:"Alex",grade:10,subject:"Math",topic:"Quadratic Equations",style:"step-by-step",audio:"off"};
      var subscription={status:"active",credits:100,paymentReference:"e2e",paidAt:new Date().toISOString()};
      localStorage.setItem("tutor:state", JSON.stringify({state:{profile:profile,subscription:subscription,stepByModule:{"quad-1":0},completed:{},lastModuleId:"quad-1"},version:2}));
      localStorage.setItem("lumen.concept","math-canvas");
      return "seeded";
    })()`);
    // Let persisted state hydrate and rebuild its non-persisted roadmap before opening a lesson.
    browse("goto", `${APP}/roadmap`);
    await sleep(1000);
    browse("goto", `${APP}/lesson/quad-1`);
    await sleep(2000);

    const boot = parseJson(
      js(
        `(function(){var e=window.__lumenE2E;return JSON.stringify({path:location.pathname,e2e:!!e,ctrl:e&&e.hasController()});})()`,
      ),
    );
    if (boot.path !== "/lesson/quad-1" || !boot.e2e || !boot.ctrl) {
      results.push(fail("lesson-boot", JSON.stringify(boot)));
    } else {
      results.push(ok("lesson-boot", JSON.stringify(boot)));
    }

    // Headless Chromium has no real mic — inject a near-silent MediaStream so LiveKit
    // can publish audio (required for Gemini Live turns / lk.chat follow-ups).
    js(`(async function(){
      var AC=window.AudioContext||window.webkitAudioContext;
      navigator.mediaDevices.getUserMedia=async function(){
        var ctx=new AC();
        var osc=ctx.createOscillator();
        var gain=ctx.createGain();
        var dest=ctx.createMediaStreamDestination();
        gain.gain.value=0.0001;
        osc.connect(gain); gain.connect(dest); osc.start();
        return dest.stream;
      };
      return "fake-mic";
    })()`);

    js(
      `(async function(){await window.__lumenE2E.start("quad-1",{mic:true});return "started";})()`,
    );
    let live = { status: "idle", err: null, overlay: false };
    for (let i = 0; i < 20; i++) {
      await sleep(500);
      live = parseJson(
        js(
          `(function(){var e=window.__lumenE2E;return JSON.stringify({status:e.getStatus(),err:e.getError(),overlay:!!document.querySelector(".lumen-overlay")});})()`,
        ),
      );
      if (
        live.status === "listening" ||
        live.status === "speaking" ||
        live.status === "error"
      )
        break;
    }
    results.push(
      (live.status === "listening" || live.status === "speaking") &&
        !live.err &&
        live.overlay
        ? ok("live-connect", JSON.stringify(live))
        : fail("live-connect", JSON.stringify(live)),
    );

    const cmds = parseJson(
      js(`(function(){var e=window.__lumenE2E;return JSON.stringify({
        clear:e.apply({id:"e2e-1",op:"clear",args:{}}),
        highlight:e.apply({id:"e2e-2",op:"highlight",args:{target:"vertex",label:"vertex"}}),
        circle:e.apply({id:"e2e-3",op:"circle",args:{target:"root1"}}),
        write:e.apply({id:"e2e-4",op:"writeBlock",args:{lines:["E2E write","ok"],target:"vertex",place:"right"}}),
        setPara:e.apply({id:"e2e-5",op:"setParabola",args:{a:1,b:-5,c:6}})
      });})()`),
    );
    const cmdFail = Object.entries(cmds).filter(
      ([, v]) => !String(v).startsWith("ok"),
    );
    results.push(
      cmdFail.length
        ? fail("canvas-ops", JSON.stringify(cmds))
        : ok("canvas-ops", JSON.stringify(cmds)),
    );

    js(
      `(async function(){await window.__lumenE2E.sendText("Circle the vertex and say if a is positive.");return "sent";})()`,
    );
    let talk = {
      status: "idle",
      turnCount: 0,
      tutorChars: 0,
      preview: "",
      writeOnBoard: [],
    };
    for (let attempt = 0; attempt < 2; attempt++) {
      for (let i = 0; i < 20; i++) {
        await sleep(1000);
        talk = parseJson(
          js(`(function(){var e=window.__lumenE2E;var turns=e.getTurns()||[];return JSON.stringify({
            status:e.getStatus(),
            turnCount:turns.length,
            tutorChars:turns.filter(function(t){return t.from==="tutor";}).reduce(function(n,t){return n+t.text.length;},0),
            preview:(turns.map(function(t){return t.text;}).join(" | ")).slice(0,200),
            writeOnBoard:Array.from(document.querySelectorAll(".mc-annotation-layer text, .mc-annotation-layer foreignObject")).map(function(n){return (n.textContent||"").trim();}).filter(Boolean).slice(0,6)
          });})()`),
        );
        if (talk.tutorChars > 20 || talk.status === "speaking") break;
      }
      if (talk.tutorChars > 20 || talk.status === "speaking") break;
      js(
        `(async function(){await window.__lumenE2E.sendText("Please say hello and mention the parabola on the board.");return "retry";})()`,
      );
    }
    const spoke = talk.tutorChars > 20 || talk.status === "speaking";
    results.push(
      spoke
        ? ok("lumen-reply-transcript", JSON.stringify(talk))
        : fail("lumen-reply-transcript", JSON.stringify(talk)),
    );

    js(
      `(async function(){await window.__lumenE2E.stop();return "stopped";})()`,
    );
    await sleep(800);
    const stop = parseJson(
      js(
        `(function(){var e=window.__lumenE2E;return JSON.stringify({status:e.getStatus(),err:e.getError(),toast:!!document.querySelector(".lumen-toast")});})()`,
      ),
    );
    results.push(
      stop.status === "idle" && !stop.err && !stop.toast
        ? ok("clean-stop", JSON.stringify(stop))
        : fail("clean-stop", JSON.stringify(stop)),
    );

    // Regression: reconnecting the same learner/module must create a fresh room + agent job.
    js(
      `(async function(){await window.__lumenE2E.start("quad-1",{mic:true});return "restarted";})()`,
    );
    await sleep(1200);
    js(
      `(async function(){await window.__lumenE2E.sendText("Reconnect check: reply with ready.");return "sent";})()`,
    );
    let reconnect = { status: "idle", turnCount: 0, tutorChars: 0, err: null };
    for (let i = 0; i < 20; i++) {
      await sleep(1000);
      reconnect = parseJson(
        js(`(function(){var e=window.__lumenE2E;var turns=e.getTurns()||[];return JSON.stringify({
          status:e.getStatus(),err:e.getError(),turnCount:turns.length,
          tutorChars:turns.filter(function(t){return t.from==="tutor";}).reduce(function(n,t){return n+t.text.length;},0)
        });})()`),
      );
      if (reconnect.tutorChars > 10 || reconnect.status === "error") break;
    }
    results.push(
      reconnect.tutorChars > 10 && !reconnect.err
        ? ok("live-reconnect", JSON.stringify(reconnect))
        : fail("live-reconnect", JSON.stringify(reconnect)),
    );
    js(
      `(async function(){await window.__lumenE2E.stop();return "stopped-again";})()`,
    );
  } catch (e) {
    results.push(fail("browser-e2e-crash", String(e)));
  }

  const failed = results.filter((r) => !r.pass);
  console.log(
    JSON.stringify(
      {
        summary: {
          pass: failed.length === 0,
          failed: failed.length,
          total: results.length,
        },
        results,
      },
      null,
      2,
    ),
  );
  process.exit(failed.length ? 1 : 0);
}

main();
