import { useEffect, useContext, useState, useRef } from 'react';
import { createWebsocket } from 'api/fetchUtil';
import { addContactRing } from 'api/addContactRing';
import { addCall } from 'api/addCall';
import { keepCall } from 'api/keepCall';
import { removeCall } from 'api/removeCall';
import { removeContactCall } from 'api/removeContactCall';

export function useRingContext() {
  const [state, setState] = useState({
    ringing: new Map(),
    callStatus: null,
    stream: null,
  });
  const access = useRef(null);

  const EXPIRE = 3000
  const RING = 2000
  const ringing = useRef(new Map());
  const calling = useRef(null);
  const ws = useRef(null);
  const pc = useRef(null);
  const stream = useRef(null);

  const updateState = (value) => {
    setState((s) => ({ ...s, ...value }))
  }

  const actions = {
    setToken: (token) => {
      if (access.current) {
        throw new Error("invalid ring state");
      }
      access.current = token;
      ringing.current = new Map();
      calling.current = null;
      updateState({ callStatus: null, ringing: ringing.current });
    },
    clearToken: () => {
      access.current = null;
    },
    ring: (cardId, callId, calleeToken) => {
      const key = `${cardId}:${callId}`
      const call = ringing.current.get(key) || { cardId, calleeToken, callId }
      call.expires = Date.now() + EXPIRE;
      ringing.current.set(key, call);
      updateState({ ringing: ringing.current });
      setTimeout(() => {
        updateState({ ringing: ringing.current });
      }, EXPIRE);
    },
    ignore: (cardId, callId) => {
      const key = `${cardId}:${callId}`
      const call = ringing.current.get(key);
      if (call) {
        call.status = 'ignored'
        ringing.current.set(key, call);
        updateState({ ringing: ringing.current });
      }
    },
    decline: (cardId, callId) => {
      const key = `${cardId}:${callId}`
      const call = ringing.current.get(key);
      if (call) {
        call.status = 'declined'
        ringing.current.set(key, call);
        updateState({ ringing: ringing.current });
      }
    },
    accept: async (cardId, callId, contactNode, contactToken, calleeToken) => {
      if (calling.current) {
        throw new Error("active session");
      }

      const key = `${cardId}:${callId}`
      const call = ringing.current.get(key);
      if (call) {
        call.status = 'accepted'
        ringing.current.set(key, call);
        updateState({ ringing: ringing.current });

        // connect signal socket
        calling.current = { state: "connecting", callId, contactNode, contactToken, host: false };
        updateState({ callStatus: "connecting" });

        // form peer connection
        pc.current = new RTCPeerConnection();
        pc.current.ontrack = (ev) => { //{streams: [stream]}) => {
          console.log("ADD TRACK", ev);
          if (!stream.current) {
console.log("ADD STREAM");
            stream.current = new MediaStream();
            updateState({ stream: stream.current });
          }
          stream.current.addTrack(ev.track);
        };
        pc.current.onicecandidate = ({candidate}) => {
          ws.current.send(JSON.stringify({ candidate }));
        };
        pc.current.onnegotiationneeded = async () => {
          if (calling.current.state === 'connected') {
            const offer = await pc.current.createOffer();
            if (pc.current.signalingState !== 'stable') {
              return;
            }
            await pc.current.setLocalDescription(offer);
            ws.current.send(JSON.stringify({ description: pc.current.localDescription }));
          }
        };

console.log("ADD TRANSCEIVER");
        const media = await whiteNoise();
        pc.current.addTransceiver(media.getTracks()[0], {streams: [media]});

        ws.current = createWebsocket(`wss://${contactNode}/signal`);
        ws.current.onmessage = async (ev) => {
          // handle messages [impolite]
          try {
            const signal = JSON.parse(ev.data);
            if (signal.description) {
              if (signal.description.type === 'offer' && pc.current.signalingState !== 'stable') {
                return; //rudely ignore
              }
              await pc.current.setRemoteDescription(signal.description);
              if (signal.description.type === 'offer') {
                const answer = await pc.current.createAnswer();
                await pc.current.setLocalDescription(answer);
                ws.current.send(JSON.stringify({ description: pc.current.localDescription }));
              }
            }
            else if (signal.candidate) {
              await pc.current.addIceCandidate(signal.candidate);
            }
            console.log(signal);
          }
          catch (err) {
            console.log(err);
          }
        }
        ws.current.onclose = (e) => {
          // update state to disconnected
          pc.current.close();
          calling.current = null;
          updateState({ calling: null });
        }
        ws.current.onopen = async () => {
          calling.current.state = "connected"
          updateState({ callStatus: "connected" });
          ws.current.send(JSON.stringify({ AppToken: calleeToken }))

          try {
            const offer = await pc.current.createOffer();
            await pc.current.setLocalDescription(offer);
            ws.current.send(JSON.stringify({ description: pc.current.localDescription }));
          }
          catch(err) {
            console.log(err);
          }
        }
        ws.current.error = (e) => {
          console.log(e)
          ws.current.close();
        }
      }
    },
    end: async () => {
      if (!calling.current) {
        throw new Error('inactive session');
      }
      try {
        const { host, callId, contactNode, contactToken } = calling.current;
        if (host) {
          await removeCall(access.current, callId);
        }
        else {
          await removeContactCall(contactNode, contactToken, callId);
        }
      }
      catch (err) {
        console.log(err);
      }
      ws.current.close();
    },
    call: async (cardId, contactNode, contactToken) => {
      if (calling.current) {
        throw new Error("active session");
      }

      // create call
      const call = await addCall(access.current, cardId);
      const { id, keepAlive, callerToken, calleeToken } = call;
      try {
        await addContactRing(contactNode, contactToken, { index, callId: id, calleeToken });
      }
      catch (err) {
        console.log(err);
      }
      const aliveInterval = setInterval(async () => {
        try {
          await keepCall(access.current, id);
        }
        catch (err) {
          console.log(err);
        }
      }, keepAlive * 1000);
      let index = 0;
      const ringInterval = setInterval(async () => {
        try {
          await addContactRing(contactNode, contactToken, { index, callId: id, calleeToken });
          index += 1;
        }
        catch (err) {
          console.log(err);
        }
      }, RING);

      calling.current = { state: "connecting", callId: id, host: true };
      updateState({ callStatus: "connecting" });

      // form peer connection
      pc.current = new RTCPeerConnection();
      pc.current.ontrack = (ev) => { //{streams: [stream]}) => {
        console.log("ADD TRACK", ev);
        if (!stream.current) {
          stream.current = new MediaStream();
console.log("ADD STREAM");
          updateState({ stream: stream.current });
        }
        stream.current.addTrack(ev.track);
      };
      pc.current.onicecandidate = ({candidate}) => {
        ws.current.send(JSON.stringify({ candidate }));
      };
      pc.current.onnegotiationneeded = async () => {
        if (calling.current.state === 'connected') {
          const offer = await pc.current.createOffer();
          if (pc.current.signalingState !== 'stable') {
            return;
          }
          await pc.current.setLocalDescription(offer);
          ws.current.send(JSON.stringify({ description: pc.current.localDescription }));
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      for (const track of stream.getTracks()) {
console.log("ADD TRANSCEIVER TRACK");
        pc.current.addTrack(track);
      }
//      const stream = await whiteNoise();
  //    pc.current.addTransceiver(stream.getTracks()[0], {streams: [stream]});

      const protocol = window.location.protocol === 'http:' ? 'ws://' : 'wss://';
      ws.current = createWebsocket(`${protocol}${window.location.host}/signal`);
      ws.current.onmessage = async (ev) => {
        // handle messages [polite]
        try {
          const signal = JSON.parse(ev.data);
          if (signal.status) {
            if (calling.current.state !== 'connected' && signal.status === 'connected') {
              clearInterval(ringInterval);
              calling.current.state = 'connected';
              updateState({ callStatus: "connected" });
            }
          }
          else if (signal.description) {
            if (signal.description.type === 'offer' && pc.current.signalingState !== 'stable') {
              await pc.current.setLocalDescription({ type: "rollback" });
            }
            await pc.current.setRemoteDescription(signal.description);
            if (signal.description.type === 'offer') {
              const answer = await pc.current.createAnswer();
              await pc.current.setLocalDescription(answer);
              ws.current.send(JSON.stringify({ description: pc.current.localDescription }));
            }
          }
          else if (signal.candidate) {
            await pc.current.addIceCandidate(signal.candidate);
          }
          console.log(signal);
        }
        catch (err) {
          console.log(err);
        }
      }
      ws.current.onclose = (e) => {
        pc.current.close();
        clearInterval(ringInterval);
        clearInterval(aliveInterval);
        calling.current = null;
        updateState({ callStatus: null });
      }
      ws.current.onopen = () => {
        calling.current.state = "ringing";
        updateState({ callStatus: "ringing" });
        ws.current.send(JSON.stringify({ AppToken: callerToken }))
      }
      ws.current.error = (e) => {
        console.log(e)
        ws.current.close();
      }
    },
  }

  return { state, actions }
}

function whiteNoise() {
    const canvas = Object.assign(document.createElement("canvas"), {width: 320, height: 240});
    const ctx = canvas.getContext('2d');
    ctx.fillRect(0, 0, 320, 240);
    const p = ctx.getImageData(0, 0, 320, 240);
    requestAnimationFrame(function draw(){
      for (var i = 0; i < p.data.length; i++) {
        p.data[i++] = p.data[i++] = p.data[i++] = Math.random() * 255;
      }
      ctx.putImageData(p, 0, 0);
      requestAnimationFrame(draw);
    });
    return canvas.captureStream();
  }
