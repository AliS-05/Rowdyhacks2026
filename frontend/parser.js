/* parser.js - written by Bridge.java.
   When Load it is pressed, script.js calls window.parseProgram. This version sends the
   program to the bridge, which runs the assembler and the CPU and returns the result. */
(function () {
  var PORT = 8080;

  // The bridge is tried at each of these in turn. The last one is this page's own
  // address, which is the right one when the page was opened through the bridge.
  var ADDRESSES = ['http://127.0.0.1:' + PORT + '/run', 'http://localhost:' + PORT + '/run'];
  var own = /^https?:$/.test(location.protocol) ? location.origin + '/run' : null;
  if (own && ADDRESSES.indexOf(own) < 0) ADDRESSES.push(own);

  // Sends the request to one address. Returns the bridge's reply, or null if the
  // bridge is not at that address (nothing answered, or something else did).
  function ask(address, body) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', address, false);                  // false = wait here for the answer
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(body);
      var reply = JSON.parse(xhr.responseText);
      return (reply && typeof reply.ok === 'boolean') ? reply : null;
    } catch (e) {
      return null;
    }
  }

  window.parseProgram = function (text, regsText) {
    var body = JSON.stringify({ source: text, registers: regsText });
    for (var i = 0; i < ADDRESSES.length; i++) {
      var reply = ask(ADDRESSES[i], body);
      if (reply) {
        if (!reply.ok) throw explain(reply);
        return reply;                                    // script.js uses reply.instructions and reply.init
      }
    }
    throw 'Could not reach the bridge. It has to be running: in a terminal, run   java Bridge.java   ' +
          'and leave that window open. To check, open ' + ADDRESSES[0] + ' in a new tab; ' +
          'a running bridge answers with a line of JSON.';
  };

  // says where it stopped, plus what the assembler or CPU printed
  function explain(reply) {
    var error = reply.error || 'no reason given';
    if (reply.stage === 'request') return error;         // a problem with what was typed
    var stage = reply.stage || 'bridge';
    var text = 'Stopped at the ' + stage + ' stage: ' + error + '.';
    var asm = reply.assembler || {}, emu = reply.emulator || {};
    // what the program that failed printed; error messages are at the end, so keep the end
    var said = (stage === 'emulator' ? [emu.raw, emu.stderr] : [asm.stdout, asm.stderr]);
    said = said.filter(Boolean).join(' ').trim();
    if (said.length > 400) said = '... ' + said.slice(-400);
    text += said ? ' The ' + stage + ' printed: ' + said : ' The ' + stage + ' printed nothing.';
    if (stage === 'emulator' && asm.output_from) {
      text += ' (It was given the assembler output: ' + asm.output_from + ', ' + asm.output_bytes + ' bytes.)';
    }
    return text + ' The full details are in the terminal window where the bridge is running.';
  }
})();
