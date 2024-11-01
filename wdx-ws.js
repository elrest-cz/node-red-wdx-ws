/**
 * Elrest - Node RED - Runtime Node
 * 
 * @copyright 2024 Elrest Automations Systeme GMBH
 */

module.exports = function (RED) {

	"use strict";

	const ws = require("ws");
	const uuid = require("uuid");
	const { Subject, BehaviorSubject } = require("rxjs");

	const WDXSchema = require("@wago/wdx-schema");

	const WS_STATUS_ONLINE_COLOR = 'green';
	const WS_STATUS_OFFLINE_COLOR = 'red';
	const WS_STATUS_ERROR_COLOR = 'red';
	const WS_STATUS_CONNECTING_COLOR = 'blue';

	const WS_STATUS_CODES = {
		CONNECTING: 'CONNECTING',
		OPEN: 'OPEN',
		CLOSING: 'CLOSING',
		CLOSED: 'CLOSED'
	};

	const NODE_STATUS = {
		OPEN: {
			fill: WS_STATUS_ONLINE_COLOR,
			shape: "dot",
			text: "Open"
		},
		ERROR: {
			fill: WS_STATUS_ERROR_COLOR,
			shape: "dot",
			text: "Error"
		},
		CLOSED: {
			fill: WS_STATUS_OFFLINE_COLOR,
			shape: "dot",
			text: "Closed"
		},
		CONNECTING: {
			fill: WS_STATUS_CONNECTING_COLOR,
			shape: "dot",
			text: "Connecting"
		},
		CLOSING: {
			fill: WS_STATUS_CONNECTING_COLOR,
			shape: "dot",
			text: "Closing"
		}
	};

	const WS_RECONNECT_TIMEOUT = 1000;

	function WDXWebSocketClient(config) {
		RED.nodes.createNode(this, config);

		this.__ws = undefined;
		this.__wsStatus = new BehaviorSubject(WS_STATUS_CODES.CONNECTING);
		this.__wsIncomingMessages = new Subject();
		this.__closing = false;

		const __connect = async () => {

			this.__ws = new ws(config.url);
			this.__ws.setMaxListeners(0);
			this.__ws.uuid = uuid.v4();

			this.__ws.on('open', () => {
				//console.log("WDXWebSocketClient.opened");

				this.__wsStatus.next(WS_STATUS_CODES.OPEN);
				this.emit(
					'opened',
					{
						count: '',
						id: this.__ws.uuid
					}
				);
			});

			this.__ws.on('close', () => {

				//console.log("WDXWebSocketClient.ws.closed", this.__closing);
				this.__wsStatus.next(WS_STATUS_CODES.CLOSED);

				this.emit('closed', { count: '', id: this.__ws.uuid });

				if (!this.__closing) {
					// Node is closing - do not reconnect ws after its disconnection when node shutdown
					clearTimeout(this.tout);
					//console.log("WDXWebSocketClient.ws.reconnect");
					this.tout = setTimeout(
						() => {
							__connect();
						}, WS_RECONNECT_TIMEOUT
					);
				}
			});

			this.__ws.on('error', (err) => {

				console.error("WDXWebSocketClient.error", err);

				this.emit(
					'erro',
					{
						err: err,
						id: this.__ws.uuid
					}
				);

				if (!this.__closing) {
					clearTimeout(this.tout);

					this.tout = setTimeout(
						() => {
							__connect();
						}, WS_RECONNECT_TIMEOUT
					);
				}
			});

			this.__ws.on(
				'message',
				(data, flags) => {
					//console.debug("WDXWebSocketClient.ws.message", data.toString(), flags);
					this.__wsIncomingMessages.next(JSON.parse(data));
				}
			);
		}

		this.on("close", (done) => {
			//console.log("WDXWebSocketClient.close");

			this.__closing = true;
			this.__wsStatus.next(WS_STATUS_CODES.CLOSING);
			this.__ws.close();
			return done();
		});

		__connect();
	}

	WDXWebSocketClient.prototype.wsStatus = function () {
		return this.__wsStatus;
	}

	WDXWebSocketClient.prototype.wsMessages = function () {
		return this.__wsIncomingMessages;
	}

	WDXWebSocketClient.prototype.wsSend = function (data) {
		this.__ws.send(JSON.stringify(data));
	}

	RED.nodes.registerType("wago.wdx.web-socket", WDXWebSocketClient);

}