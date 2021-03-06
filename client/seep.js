// Singleton class
if(typeof seep === "undefined") {

var seep = (function(){

	// Decide if we're in the server or not
	var server = false,
	     settings
	  if (typeof exports !== "undefined") {
	    settings = exports
	    server = true
	  } else {
	    settings = this.settings = {}
	  }
	 
	if(!server) {
		var console = window.console;
		if (!console || !console.log || !console.error) {
			console = {log: function(){ }, error: function(){ }};
		}
		
		// TODO see how we could determine across applications whether 
		// the type is loaded or not and block execution accordingly
		//$LAB.setGlobalDefaults({AllowDuplicates: false});
	}
	
	// Used for initializing the application and reconnecting after a socket disconnect
	settings.MESSAGE_INIT = "seep_init"
	settings.MESSAGE_UPDATE = "update"
	
	var applications = {}
	
	// Single socket for instantiating apps for namespaced connections
	var conn = null
	
	// Public interface
	return {
		init: function(appPath, appId) {
			if(typeof appId === "boolean" && appId)
				appId = appPath
	    	setTimeout(function() {
			    new seep.application(appPath, appId);
			}, 10)
			
			seep.serverAddr = seep.standalone!=undefined? document.location.origin + seep.standalone : document.location
			conn = io.connect(seep.serverAddr)
			conn.on(settings.MESSAGE_UPDATE, function(data) {
				if(data.sid) {
					console.log("New session id", data.sid)
					// TODO make the timeout configurable
					seep.createCookie("seep.sid", data.sid, 1)
				}
			})
		},
		
		openConnection: function(appPath, app) {
			console.log("Starting connection for", appPath)
			conn.emit(settings.MESSAGE_INIT, {path: appPath, sid: seep.readCookie("seep.sid") }, function(sid) {
				app.start(sid)
			})
		},
		
		getApplication: function(id) {
			return applications[id]
		},
		
		// Shorthand version for seep.getApplication(id).getWidgetById(id)
		get: function(appId, widgetId) {
			return seep.getApplication(appId).getWidgetById(widgetId)
		},
		
		addApplication: function(app) {
			applications[app.id] = app
		},
		
		// Only accepts the root element of a Seep widget, not contained elements
		getWidget: function(el) {
			if(el.__seepId) {
				// Find the application root element and its id
				var p = el.parentNode
				while(p.className.indexOf("seep-app") < 0) {
					p = p.parentNode
				}
				return seep.getApplication(p.__seepId).getWidgetById(el.__seepId)
			}
			console.warn("No Seep widget found for element", el)
			return null
		},
		
		createCookie: function(name,value,days) {
			if (days) {
				var date = new Date();
				date.setTime(date.getTime()+(days*24*60*60*1000));
				var expires = "; expires="+date.toGMTString();
			}
			else var expires = "";
			document.cookie = name+"="+value+expires+"; path=/";
		},
		
		readCookie: function(name) {
			var nameEQ = name + "=";
			var ca = document.cookie.split(';');
			for(var i=0;i < ca.length;i++) {
				var c = ca[i];
				while (c.charAt(0)==' ') c = c.substring(1,c.length);
				if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length,c.length);
			}
			return null;
		},
		
		eraseCookie: function(name) {
			createCookie(name,"",-1);
		}
	}

})();

/**********************************************************
 * Seep application class
 **********************************************************/
seep.application = function(appPath, elementId) {
	
	this.applicationWidgets = {}
	
	this.rootElement = elementId? document.getElementById(elementId) : document.body
	this.rootElement.className += (this.rootElement.className.length>0? " " : "") + "seep-app"
	!elementId? document.documentElement.style.minHeight = "100%" : null
	this.path = appPath
	
	var self = this

	// Start the application (initialize the namespaced connection on the server)
	seep.openConnection(appPath, this)
	
	this.start = function(sid) {
		// Namespace the connection to this application
		self.conn = io.connect(seep.serverAddr + appPath + "_" + sid)
			
		self.conn.on("connect", function() {
			console.log("Application connected ("+seep.serverAddr + appPath + "_" + sid +")")
		})
		
		self.conn.on('update', function(data) {
			// TODO keep the cookie alive if the application is used
			console.log("Update for app '"+self.path+"' (id:" + self.id + ")", data)
			self.update(data)
		})
		
		self.conn.on('disconnect', function() {
			console.log("Application (id:" + self.id + ") disconnected")
			$(self.getElement()).append('<div class="disconnected">App Disconnected</div>')
			// TODO server down? connection breaking?
			// TODO need to clear the application from the DOM, make a full refresh
			//this.connect()
		})
	}
	
	this.update = function(json) {
		this.id = json.id
		if(!seep.getApplication(this.id)) {
			seep.addApplication(this)
			this.rootElement.__seepId = this.id
			this.rootElement.innerHTML = ""
		}
		
		if(this.rootElement == document.body && json.name)
			document.title = json.name
			
		if(json.types) {
			var load = []
	    	for(var i=0; i < json.types.length; i++) {
	    		// TODO see where proper document root is
	    		load.push("/widgets/" + json.types[i].replace(/\./g, "/") + ".js")
	    	}
	    	var self = this;
	    	$LAB.setOptions({AlwaysPreserveOrder:true}).script(load).wait(function() {
	    		self.processWidgetChanges(json.widgets, json.focused)
	    	})
		} else {
			this.processWidgetChanges(json.widgets, json.focused)
		}
		if(json.log) {
			for(var i=0; i < json.log.length; i++) {
				console.log(json.log[i])
			}
		}
	}
	    
	this.processWidgetChanges = function(widgets, focused) {
		if(!widgets)
			return
	    for(var i=0; i < widgets.length; i++) {
	        var json = widgets[i];
	        var widget = this.getWidget(json);
	        if(widget) {
	            widget.update(json);
	            if(widget.element.parentNode == null) {
	            	if(widget.type == "overlay")
	            		document.body.appendChild(widget.element)
	            	else
	            		this.getElement().appendChild(widget.element)
	            	widget.attached()
	            }
	        } else {
	        	console.log("No widget found for JSON", json)
	        }
	    }
	    if(focused)
	    	this.getWidgetById(focused).focus()
	}
	
	this.getWidget = function(json) {
		var widget = this.getWidgetById(json.id)
	    if(!widget && json.type) {
	    	if(json.type.indexOf(".")>0) {
	    		var types = json.type.split(".")
	    		var constr = seep[types[0]]
	    		for(var i=1; i < types.length; i++) {
	    			constr = constr[types[i]]
	    		}
	    	} else {
	    		var constr = seep[json.type]
	    	}
	    	if(typeof constr == "undefined") {
	    		console.log("Oops, something went wrong: the widget prototype for "+json.type+" is not defined")
	    		return null
	    	}
	    	widget = new constr(json)
	    	this.applicationWidgets[json.id] = widget
	    	widget.application = this
	    } else if(!widget) {
	    	console.error("Failed to initialize a widget (no type specified?)", json)
	    }
	    return widget
	}
	
	this.getWidgetById = function(id) {
		return this.applicationWidgets[id]
	}
	
	this.unregister = function(id) {
		$(this.applicationWidgets[id].element).unbind()
		this.applicationWidgets[id].application = null
		this.applicationWidgets[id] = null
		delete this.applicationWidgets[id]
	}
		
	this.getElement = function() {
		return this.rootElement
	}
	
	// FIXME create a buffer for these messages that queue up and are handled in the correct order in the server
	var messageNumber = 0
	this.messageQueue = {sync: {}, events: []}
	
	this.sendEvent = function(widget, type, event, lazy) {
		var send = ["altKey", "charCode", "clientX", "clientY", "ctrlKey", "data", "detail", "keyCode", "layerX", "layerY", "metaKey", "offsetX", "offsetY", "pageX", "pageY", "screenX", "screenY", "shiftKey", "wheelDelta", "which"]
		var eventObj = {}
		for(var i=0; i < send.length; i++) {
			if(typeof event[send[i]] != "undefined")
				eventObj[send[i]] = event[send[i]]
		}
		
		eventObj.type = type
		
		// Send widget coordinates
		var offset = $(widget.element).offset()
		eventObj.pageX = offset.left
		eventObj.pageY = offset.top
		eventObj.offsetX = 0
		eventObj.offsetY = 0
		
		eventObj.id = widget.id
		
		this.messageQueue.events.push(eventObj)
		if(!lazy)
			this.sendMessages()
	}
	
	// Sync messages are always lazy
	this.sync = function(widgetId, prop, val) {
		if(!this.messageQueue.sync[""+widgetId])
			this.messageQueue.sync[""+widgetId] = {}
		this.messageQueue.sync[""+widgetId][prop] = val
	}
	
	this.sendMessages = function() {
		console.log("Sending messages to server for app("+this.id+")", this.messageQueue)
		this.conn.emit("update", {time: new Date().getTime(), messages: this.messageQueue})
		this.messageQueue = {sync: {}, events: []}
	}
	
	// Send all pending messages when the page is unloaded
	window.addEventListener("beforeunload", function() {	
		self.sendMessages()
	})
	
}

/**********************************************************
 * Core widget class
 **********************************************************/
Function.prototype.inherit = function( parentClassOrObject ){ 
	if ( parentClassOrObject.constructor == Function ) { 
		// Normal Inheritance 
		this.prototype = new parentClassOrObject;
		this.prototype.constructor = this;
		this.prototype.parent = parentClassOrObject.prototype;
	} else { 
		// Pure Virtual Inheritance 
		this.prototype = parentClassOrObject;
		this.prototype.constructor = this;
		this.prototype.parent = parentClassOrObject;
	}
}

seep.widget = function(json) {
	if(!json)
		return // inheriting, no need to initialize further
		
    this.type = json.type
	this.parent = null
	this.application = null
	this.element = document.createElement(json.elementType? json.elementType : "div")
	this.id = this.element.__seepId = json.id;
	this.synching = true
	this.syncProps = {}
	this.visible = true
	
	var self = this
	this.watch("visible", function(prop, old, val) {
		self.element.style.display = val ? "" : "none"
		self.sync(prop, old, val)
		return val
	})
	
	this.watch("width", function(prop, old, val) {
		if(old != val) {
			self.element.style.width = val
			var prevSync = self.synching
	    	self.sync(true)
	    	self.pixelWidth = self.element.offsetWidth
	    	self.sync("pixelWidth", "", self.element.offsetWidth)
	    	self.sync(prevSync)
	    	self.sync(prop, old, val)
	    }
	    return val
	})
	
	this.watch("height", function(prop, old, val) {
		if(old != val) {
			self.element.style.height = val
			var prevSync = self.synching
			self.sync(true)
			self.pixelHeight = self.element.offsetHeight
			self.sync("pixelHeight", "", self.element.offsetHeight)
			self.sync(prevSync)
	    	self.sync(prop, old, val)
		}
		return val
	})
    
    if(json.focusable) {
    	this.focus = function() {
			self.element.focus()
    	}
    }
}

seep.widget.prototype.sync = function() {
	if(arguments.length==1)
		this.synching = arguments[0]
	else {
		var prop = arguments[0]
		var old = arguments[1]
		var val = arguments[2]
		if((this.syncProps[prop] || prop=="pixelWidth" || prop=="pixelHeight") && old != val && this.synching) {
			this.application.sync(this.id, prop, val)
		}
	}
}

seep.widget.prototype.update = function(json) {	
	this.sync(false)
	
	if(json.sync) {
		for(var prop in json.sync)
			this.syncProps[prop] = true
	}
	
	if(typeof json.visible != "undefined")
		this.visible = json.visible
	
	if(json.tooltip)
		this.element.title = json.tooltip
	
	if(json.width)
		this.width = json.width
	
	if(json.height)
		this.height = json.height

    if(json.styles) {
    	for(var i=0; i < json.styles.length; i++) {
    		var style = json.styles[i]
    		if(typeof style == "string")
    			$(this.element).addClass(style)
    		else if(style.remove) {
    			$(this.element).removeClass(style.style)
    		}
    	}
    }
    
    function createServerListener(type) {
    	return function(event) {
    		var w = seep.getWidget(this)
			w.application.sendEvent(w, type, event)
    	}
    }
    
    function createClientListener(type, fn) {
    	return function(event) {
    	    var func = new Function(fn)
    	    event.source = seep.getWidget(this)
    	    // Set widget coordinates
		    var offset = $(this).offset()
		    event.pageX = offset.left
		    event.pageY = offset.top
		    event.offsetX = 0
		    event.offsetY = 0
    	    func.call(this, event)
    	}
    }
    
    if(json.listeners) {
    	if(json.listeners.server) {
    		for(var type in json.listeners.server) {
    			if(json.listeners.server[type] < 0) {
					$(this.element).unbind(type+".server")
    			} else {
					$(this.element).bind(type+".server", createServerListener(type))
    			}
    		}
    	}
    	if(json.listeners.client) {
    		for(var i=0; i <  json.listeners.client.length; i++) {
    			var listenerObj = json.listeners.client[i]
    			var type = listenerObj.t+""
    			var id = listenerObj.id+""
    			if(listenerObj.remove) {
    				$(this.element).unbind(type+".id"+id)
    			} else {
    				var fn = "" + listenerObj.l
    				$(this.element).bind(type+".id"+id, createClientListener(type, fn))
    			}
    		}
    	}
    }
    
    this.sync(true)
    
    if(this.parent)
    	this.updateSize()
}

seep.widget.prototype.updateSize = function() {
	var oldW = this.pixelWidth || 0
	var oldH = this.pixelHeight || 0
	this.pixelWidth = this.element.offsetWidth
	this.pixelHeight = this.element.offsetHeight
	this.sync("pixelWidth", oldW, this.pixelWidth)
	this.sync("pixelHeight", oldH, this.pixelHeight)
}

seep.widget.prototype.attached = function() {
	this.updateSize()
	$(this.element).trigger("attach")
}

seep.widget.prototype.addStyle = function(style) {
	var oldStyles = ""+this.element.className
	$(this.element).addClass(style)
	this.sync("styles", oldStyles, this.element.className)
}

seep.widget.prototype.removeStyle = function(style) {
	var oldStyles = ""+this.element.className
	$(this.element).removeClass(style)
	this.sync("styles", oldStyles, this.element.className)
}

seep.widget.prototype.watch = function (prop, handler) {
    var oldval = this[prop], newval = oldval,
    getter = function () {
        return newval;
    },
    setter = function (val) {
        oldval = newval;
        return newval = handler.call(this, prop, oldval, val);
    };
    if (delete this[prop]) { // can't watch constants
       if (seep.widget.defineProperty) // ECMAScript 5
            seep.widget.defineProperty(this, prop, {
                get: getter,
                set: setter
            });
       else if (seep.widget.prototype.__defineGetter__ && seep.widget.prototype.__defineSetter__) { // legacy*/
            seep.widget.prototype.__defineGetter__.call(this, prop, getter);
            seep.widget.prototype.__defineSetter__.call(this, prop, setter);
        }
    }
};

seep.widget.prototype.unwatch = function (prop) {
    var val = this[prop];
    delete this[prop]; // remove accessors
    this[prop] = val;
};



}