/// <reference path="../typings/ws/ws.d.ts" />
/// <reference path="Registry.ts" />
/// <reference path="JsonRpc.ts" />
/// <reference path="EventBus.ts" />
import ws = require('ws');
import reg = require('./Registry');
import jrpc = require('./JsonRpc');
import bus = require('./EventBus');

export var DEBUG:boolean = false;

export module api {
    export interface IBackendCallHandler {
        singleton(instanceName:string, classNames:any);
        stateless(instanceName:string, classNames:any);
        statefull(instanceName: string, classNames: any);
        getRegistry(instanceName:string): reg.api.IRPCRegistry;

        execute(client: WebSocket, instance: string, method: string, params: JSON, id: string);
        broadcastExecute(server: ws.Server, client: WebSocket, instance: string, method: string, params: JSON, id: string);
        sendResponseToOrigin(client: any, id: string, result: JSON);
        sendErrorToOrigin(client: any, id: string, code: number, message: string);
        useResponse(id: string, result: JSON);
        receiveClientError(rpc: jrpc.RPC);
    }
}

export class BackendCallHandler implements api.IBackendCallHandler {

    private _singleton: reg.ObjectRegistry;
    private _stateless: reg.ClassRegistry;
    private _names: { [name: string]: Object };
    private _eventBus: bus.EventBus;
    private _pendingRequest: { [id: string]: any };

    constructor() {
        this._names = {};
        this._singleton = new reg.ObjectRegistry();
        this._stateless = new reg.ClassRegistry();
        this._pendingRequest = {};
        this._eventBus = bus.EventBus.getSharedEventBus();
    }

    public singleton(instanceName: string, classNames: any) {
        this._names[instanceName] = this._singleton;
        this._singleton.register(instanceName, classNames);
    }

    public stateless(instanceName: string, classNames: any) {
        this._names[instanceName] = this._stateless;
        this._stateless.register(instanceName, classNames);
    }

    public statefull(instanceName: string, classNames: any) {
        console.warn('Session objects not implemented yet !');
    }

    public getRegistry(instanceName: string): reg.api.IRPCRegistry {
        if (this._names[instanceName] === this._singleton) {
            return this._singleton;
        }
        else if (this._names[instanceName] === this._stateless) {
            return this._stateless;
        }
        return null;
    }

    public execute(client:WebSocket, instance:string, method:string, params:JSON, id:string) {
        if (this._names[instance]) {
            var registry:reg.api.IRPCRegistry = null;
            if (this._names[instance] === this._singleton) {
                registry = this._singleton;
            }
            else if (this._names[instance] === this._stateless) {
                registry = this._stateless;
            }
            try {
                var result:JSON = registry.invoke(instance, method, params);
                client.send(JSON.stringify(jrpc.RPC.Response(id, result)));
            } catch (err) {
                console.warn('RPC backend call "' + instance + '.' + method + '" fail.');
                BackendCallHandler.log('<<BackendCallHandler ' + JSON.stringify(jrpc.RPC.Error('Error', jrpc.RPC.INTERNAL_ERROR,
                        'RPC backend call "' + instance + '.' + method + '" fail.')));
                client.send(JSON.stringify(jrpc.RPC.Error('Error:' + id, jrpc.RPC.INTERNAL_ERROR,
                    'RPC backend call "' + instance + '.' + method + '" fail.')));
            }
        }
        else {
            console.warn('RPC backend instance named ' + instance + ' not  found.');
            client.send(
                JSON.stringify(
                    jrpc.RPC.Error('Error:' + id, jrpc.RPC.METHOD_NOT_FOUND, 'RPC backend instance named ' + instance + ' not found.')
                )
            );
        }
    }

    public broadcastExecute(server: ws.Server, client: WebSocket, instance: string, method: string, params: JSON, id: string) {
        this._pendingRequest[id] = client;
        var m: string = instance + '.' + method;
        var newRpc = jrpc.RPC.Request(id, m, params);
        server.clients.forEach((_client) => {
            _client.send(JSON.stringify(newRpc));
        });
    }

    public sendResponseToOrigin(client: any, id: string, result: JSON) {
        if (id && client) {
            var newRpc = jrpc.RPC.Response(id, result);
            client.send(JSON.stringify(newRpc));
        }
    }

    public sendErrorToOrigin(client: any, id: string, code: number, message: string) {
        if (id && client) {
            var newRpc = jrpc.RPC.Error(id, code, message);
            client.send(JSON.stringify(newRpc));
        }
    }

    public useResponse(id: string, result: JSON) {
        this._eventBus.fire(id, result);
    }

    public receiveClientError(rpc: jrpc.RPC) {
        BackendCallHandler.log('Get error : ' + JSON.stringify(rpc));
    }

    public getClientResponseWithId(id: string): any {
        return this._pendingRequest[id];
    }

    public static log(...args:any[]) {
        if (DEBUG) {
            console.log(args);
        }
    }
}