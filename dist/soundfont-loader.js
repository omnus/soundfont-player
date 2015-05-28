(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
'use strict';

function b64ToUint6 (nChr) {
  return nChr > 64 && nChr < 91 ?
      nChr - 65
    : nChr > 96 && nChr < 123 ?
      nChr - 71
    : nChr > 47 && nChr < 58 ?
      nChr + 4
    : nChr === 43 ?
      62
    : nChr === 47 ?
      63
    :
      0;

}

// Decode Base64 to Uint8Array
// ---------------------------
function base64DecodeToArray(sBase64, nBlocksSize) {
  var sB64Enc = sBase64.replace(/[^A-Za-z0-9\+\/]/g, "");
  var nInLen = sB64Enc.length;
  var nOutLen = nBlocksSize ?
    Math.ceil((nInLen * 3 + 1 >> 2) / nBlocksSize) * nBlocksSize :
    nInLen * 3 + 1 >> 2;
  var taBytes = new Uint8Array(nOutLen);

  for (var nMod3, nMod4, nUint24 = 0, nOutIdx = 0, nInIdx = 0; nInIdx < nInLen; nInIdx++) {
    nMod4 = nInIdx & 3;
    nUint24 |= b64ToUint6(sB64Enc.charCodeAt(nInIdx)) << 18 - 6 * nMod4;
    if (nMod4 === 3 || nInLen - nInIdx === 1) {
      for (nMod3 = 0; nMod3 < 3 && nOutIdx < nOutLen; nMod3++, nOutIdx++) {
        taBytes[nOutIdx] = nUint24 >>> (16 >>> nMod3 & 24) & 255;
      }
      nUint24 = 0;
    }
  }
  return taBytes;
}

module.exports = base64DecodeToArray;

},{}],2:[function(require,module,exports){
'use strict';

var NOTE = /^([a-gA-G])(#{0,2}|b{0,2})(-?\d{0,1})$/
/*
 * parseNote
 *
 * @param {String} note - the note string to be parsed
 * @return {Object} a object with the following attributes:
 * - pc: pitchClass, the letter of the note, ALWAYS in lower case
 * - acc: the accidentals (or '' if no accidentals)
 * - oct: the octave as integer. By default is 4
 */
var parse = function(note, options) {
  if(typeof(note.pc) !== 'undefined'
    && typeof(note.acc) !== 'undefined'
    && typeof(note.oct) !== 'undefined') {
    return note;
  }

  var match = NOTE.exec(note);
  if(match) {
    var octave = match[3] !== '' ? +match[3] : 4;
    return { pc: match[1].toLowerCase(),
      acc: match[2], oct: octave };
  }
  throw Error("Invalid note format: " + note);
}

parse.toString = function(obj) {
  return obj.pc + obj.acc + obj.oct;
}

module.exports = parse;

},{}],3:[function(require,module,exports){
'use strict';

var base64DecodeToArray = require('./lib/b64decode.js');
var parse = require('note-parser');

function soundfont(ctx, name) {
  return soundfont.get(soundfont.url(name))
    .then(soundfont.parse)
    .then(function(data) {
      return createInstrument(ctx, name, data)
    })
    .then(decodeNotes)
    .then(function(instruments) {
      return instruments[0];
    });
}

function normalizeNote(name) {
  name = name.toLowerCase();
  if(name.indexOf('#') > 0) {
    name = name.replace(/#/g, 'b');
    var pc = String.fromCharCode(name.charCodeAt(0) + 1);
    pc = pc === 'h' ? 'a' : pc;
    return pc + name.substring(1);
  } else {
    return name;
  }
}

function createInstrument(ctx, name, data) {
  var instrument = { ctx: ctx, name: name, data: data };
  instrument.buffers = {};
  instrument.play = function(name, time, duration) {
    var note = normalizeNote(name);
    var source = ctx.createBufferSource();
    var buffer = instrument.buffers[note];
    if(!buffer) {
      console.log("WARNING: Note buffer not found", name, note);
      return;
    }
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(time);
    if(duration) source.stop(time + duration)
    return source;
  }

  return instrument;
}

function decodeNotes(instrument) {
  var promises = Object.keys(instrument.data).map(function(key) {
    return decodeNoteAudioData(instrument.ctx, instrument.data[key])
    .then(function(buffer) {
      instrument.buffers[key.toLowerCase()] = buffer;
      return instrument;
    });
  });

  return Promise.all(promises);
}

function decodeNoteAudioData(context, data) {
  return new Promise(function(done, reject) {
    var decodedData = base64DecodeToArray(data.split(",")[1]).buffer;
    context.decodeAudioData(decodedData, function(buffer) {
      done(buffer);
    }, function(e) {
      reject("DecodeAudioData error", e);
    });
  });
}

soundfont.url = function(name) {
  return 'https://cdn.rawgit.com/gleitz/midi-js-soundfonts/master/FluidR3_GM/' + name + '-ogg.js';
}

soundfont.get = function(url) {
  console.log("Loading " + url + " ...");
  return new Promise(function(done, reject) {
    var req = new XMLHttpRequest();
    req.open('GET', url);

    req.onload = function() {
      if (req.status == 200) {
        done(req.response);
      } else {
        reject(Error(req.statusText));
      }
    };
    req.onerror = function() {
      reject(Error("Network Error"));
    };
    req.send();
  });
}
soundfont.parse = function(data) {
  var begin = data.indexOf("MIDI.Soundfont.");
  begin = data.indexOf('=', begin) + 2;
  var end = data.lastIndexOf(',');
  return JSON.parse(data.slice(begin, end) + "}");
}

if (typeof define === "function" && define.amd) define(function() { return soundfont; });
if (typeof module === "object" && module.exports) module.exports = soundfont;
if (typeof window !== "undefined") window.soundfont = soundfont;

},{"./lib/b64decode.js":1,"note-parser":2}]},{},[3]);
