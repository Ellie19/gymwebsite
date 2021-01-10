
(function(l, r) { if (l.getElementById('livereloadscript')) return; r = l.createElement('script'); r.async = 1; r.src = '//' + (window.location.host || 'localhost').split(':')[0] + ':35730/livereload.js?snipver=1'; r.id = 'livereloadscript'; l.getElementsByTagName('head')[0].appendChild(r) })(window.document);
var app = (function () {
    'use strict';

    function noop() { }
    const identity = x => x;
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }

    const is_client = typeof window !== 'undefined';
    let now = is_client
        ? () => window.performance.now()
        : () => Date.now();
    let raf = is_client ? cb => requestAnimationFrame(cb) : noop;

    const tasks = new Set();
    function run_tasks(now) {
        tasks.forEach(task => {
            if (!task.c(now)) {
                tasks.delete(task);
                task.f();
            }
        });
        if (tasks.size !== 0)
            raf(run_tasks);
    }
    /**
     * Creates a new task that runs on each raf frame
     * until it returns a falsy value or is aborted
     */
    function loop(callback) {
        let task;
        if (tasks.size === 0)
            raf(run_tasks);
        return {
            promise: new Promise(fulfill => {
                tasks.add(task = { c: callback, f: fulfill });
            }),
            abort() {
                tasks.delete(task);
            }
        };
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function element(name) {
        return document.createElement(name);
    }
    function svg_element(name) {
        return document.createElementNS('http://www.w3.org/2000/svg', name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_style(node, key, value, important) {
        node.style.setProperty(key, value, important ? 'important' : '');
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    const active_docs = new Set();
    let active = 0;
    // https://github.com/darkskyapp/string-hash/blob/master/index.js
    function hash(str) {
        let hash = 5381;
        let i = str.length;
        while (i--)
            hash = ((hash << 5) - hash) ^ str.charCodeAt(i);
        return hash >>> 0;
    }
    function create_rule(node, a, b, duration, delay, ease, fn, uid = 0) {
        const step = 16.666 / duration;
        let keyframes = '{\n';
        for (let p = 0; p <= 1; p += step) {
            const t = a + (b - a) * ease(p);
            keyframes += p * 100 + `%{${fn(t, 1 - t)}}\n`;
        }
        const rule = keyframes + `100% {${fn(b, 1 - b)}}\n}`;
        const name = `__svelte_${hash(rule)}_${uid}`;
        const doc = node.ownerDocument;
        active_docs.add(doc);
        const stylesheet = doc.__svelte_stylesheet || (doc.__svelte_stylesheet = doc.head.appendChild(element('style')).sheet);
        const current_rules = doc.__svelte_rules || (doc.__svelte_rules = {});
        if (!current_rules[name]) {
            current_rules[name] = true;
            stylesheet.insertRule(`@keyframes ${name} ${rule}`, stylesheet.cssRules.length);
        }
        const animation = node.style.animation || '';
        node.style.animation = `${animation ? `${animation}, ` : ''}${name} ${duration}ms linear ${delay}ms 1 both`;
        active += 1;
        return name;
    }
    function delete_rule(node, name) {
        const previous = (node.style.animation || '').split(', ');
        const next = previous.filter(name
            ? anim => anim.indexOf(name) < 0 // remove specific animation
            : anim => anim.indexOf('__svelte') === -1 // remove all Svelte animations
        );
        const deleted = previous.length - next.length;
        if (deleted) {
            node.style.animation = next.join(', ');
            active -= deleted;
            if (!active)
                clear_rules();
        }
    }
    function clear_rules() {
        raf(() => {
            if (active)
                return;
            active_docs.forEach(doc => {
                const stylesheet = doc.__svelte_stylesheet;
                let i = stylesheet.cssRules.length;
                while (i--)
                    stylesheet.deleteRule(i);
                doc.__svelte_rules = {};
            });
            active_docs.clear();
        });
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            set_current_component(null);
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }

    let promise;
    function wait() {
        if (!promise) {
            promise = Promise.resolve();
            promise.then(() => {
                promise = null;
            });
        }
        return promise;
    }
    function dispatch(node, direction, kind) {
        node.dispatchEvent(custom_event(`${direction ? 'intro' : 'outro'}${kind}`));
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }
    const null_transition = { duration: 0 };
    function create_bidirectional_transition(node, fn, params, intro) {
        let config = fn(node, params);
        let t = intro ? 0 : 1;
        let running_program = null;
        let pending_program = null;
        let animation_name = null;
        function clear_animation() {
            if (animation_name)
                delete_rule(node, animation_name);
        }
        function init(program, duration) {
            const d = program.b - t;
            duration *= Math.abs(d);
            return {
                a: t,
                b: program.b,
                d,
                duration,
                start: program.start,
                end: program.start + duration,
                group: program.group
            };
        }
        function go(b) {
            const { delay = 0, duration = 300, easing = identity, tick = noop, css } = config || null_transition;
            const program = {
                start: now() + delay,
                b
            };
            if (!b) {
                // @ts-ignore todo: improve typings
                program.group = outros;
                outros.r += 1;
            }
            if (running_program || pending_program) {
                pending_program = program;
            }
            else {
                // if this is an intro, and there's a delay, we need to do
                // an initial tick and/or apply CSS animation immediately
                if (css) {
                    clear_animation();
                    animation_name = create_rule(node, t, b, duration, delay, easing, css);
                }
                if (b)
                    tick(0, 1);
                running_program = init(program, duration);
                add_render_callback(() => dispatch(node, b, 'start'));
                loop(now => {
                    if (pending_program && now > pending_program.start) {
                        running_program = init(pending_program, duration);
                        pending_program = null;
                        dispatch(node, running_program.b, 'start');
                        if (css) {
                            clear_animation();
                            animation_name = create_rule(node, t, running_program.b, running_program.duration, 0, easing, config.css);
                        }
                    }
                    if (running_program) {
                        if (now >= running_program.end) {
                            tick(t = running_program.b, 1 - t);
                            dispatch(node, running_program.b, 'end');
                            if (!pending_program) {
                                // we're done
                                if (running_program.b) {
                                    // intro — we can tidy up immediately
                                    clear_animation();
                                }
                                else {
                                    // outro — needs to be coordinated
                                    if (!--running_program.group.r)
                                        run_all(running_program.group.c);
                                }
                            }
                            running_program = null;
                        }
                        else if (now >= running_program.start) {
                            const p = now - running_program.start;
                            t = running_program.a + running_program.d * easing(p / running_program.duration);
                            tick(t, 1 - t);
                        }
                    }
                    return !!(running_program || pending_program);
                });
            }
        }
        return {
            run(b) {
                if (is_function(config)) {
                    wait().then(() => {
                        // @ts-ignore
                        config = config();
                        go(b);
                    });
                }
                else {
                    go(b);
                }
            },
            end() {
                clear_animation();
                running_program = pending_program = null;
            }
        };
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    /**
     * Base class for Svelte components. Used when dev=false.
     */
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, Object.assign({ version: '3.31.2' }, detail)));
    }
    function append_dev(target, node) {
        dispatch_dev('SvelteDOMInsert', { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev('SvelteDOMInsert', { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev('SvelteDOMRemove', { node });
        detach(node);
    }
    function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation) {
        const modifiers = options === true ? ['capture'] : options ? Array.from(Object.keys(options)) : [];
        if (has_prevent_default)
            modifiers.push('preventDefault');
        if (has_stop_propagation)
            modifiers.push('stopPropagation');
        dispatch_dev('SvelteDOMAddEventListener', { node, event, handler, modifiers });
        const dispose = listen(node, event, handler, options);
        return () => {
            dispatch_dev('SvelteDOMRemoveEventListener', { node, event, handler, modifiers });
            dispose();
        };
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev('SvelteDOMRemoveAttribute', { node, attribute });
        else
            dispatch_dev('SvelteDOMSetAttribute', { node, attribute, value });
    }
    function validate_slots(name, slot, keys) {
        for (const slot_key of Object.keys(slot)) {
            if (!~keys.indexOf(slot_key)) {
                console.warn(`<${name}> received an unexpected slot "${slot_key}".`);
            }
        }
    }
    /**
     * Base class for Svelte components with some minor dev-enhancements. Used when dev=true.
     */
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error("'target' is a required option");
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn('Component was already destroyed'); // eslint-disable-line no-console
            };
        }
        $capture_state() { }
        $inject_state() { }
    }

    function cubicOut(t) {
        const f = t - 1.0;
        return f * f * f + 1.0;
    }

    function fade(node, { delay = 0, duration = 400, easing = identity }) {
        const o = +getComputedStyle(node).opacity;
        return {
            delay,
            duration,
            easing,
            css: t => `opacity: ${t * o}`
        };
    }
    function fly(node, { delay = 0, duration = 400, easing = cubicOut, x = 0, y = 0, opacity = 0 }) {
        const style = getComputedStyle(node);
        const target_opacity = +style.opacity;
        const transform = style.transform === 'none' ? '' : style.transform;
        const od = target_opacity * (1 - opacity);
        return {
            delay,
            duration,
            easing,
            css: (t, u) => `
			transform: ${transform} translate(${(1 - t) * x}px, ${(1 - t) * y}px);
			opacity: ${target_opacity - (od * u)}`
        };
    }

    /* src\App.svelte generated by Svelte v3.31.2 */
    const file = "src\\App.svelte";

    // (34:3) {#if visible}
    function create_if_block(ctx) {
    	let p;
    	let p_transition;
    	let current;

    	const block = {
    		c: function create() {
    			p = element("p");
    			p.textContent = "Flies in and out";
    			attr_dev(p, "class", "mt-4 text-lg text-gray-300 italic");
    			add_location(p, file, 34, 3, 1610);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, p, anchor);
    			current = true;
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!p_transition) p_transition = create_bidirectional_transition(p, fly, { y: 200, duration: 2000 }, true);
    				p_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!p_transition) p_transition = create_bidirectional_transition(p, fly, { y: 200, duration: 2000 }, false);
    			p_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(p);
    			if (detaching && p_transition) p_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block.name,
    		type: "if",
    		source: "(34:3) {#if visible}",
    		ctx
    	});

    	return block;
    }

    function create_fragment(ctx) {
    	let main0;
    	let div6;
    	let div0;
    	let span0;
    	let t0;
    	let div4;
    	let div3;
    	let div2;
    	let div1;
    	let h1;
    	let t1;
    	let span1;
    	let t3;
    	let label0;
    	let input0;
    	let t4;
    	let t5;
    	let t6;
    	let a;
    	let t8;
    	let div5;
    	let svg0;
    	let polygon0;
    	let t9;
    	let section0;
    	let div20;
    	let div19;
    	let div7;
    	let img0;
    	let img0_src_value;
    	let t10;
    	let div18;
    	let div17;
    	let small;
    	let t12;
    	let h3;
    	let t14;
    	let p0;
    	let t16;
    	let ul;
    	let li0;
    	let div10;
    	let div8;
    	let span2;
    	let i0;
    	let t17;
    	let div9;
    	let h40;
    	let t19;
    	let li1;
    	let div13;
    	let div11;
    	let span3;
    	let i1;
    	let t20;
    	let div12;
    	let h41;
    	let t22;
    	let li2;
    	let div16;
    	let div14;
    	let span4;
    	let i2;
    	let t23;
    	let div15;
    	let h42;
    	let t25;
    	let section1;
    	let div33;
    	let div22;
    	let div21;
    	let h20;
    	let t27;
    	let p1;
    	let t29;
    	let div32;
    	let div25;
    	let div24;
    	let img1;
    	let img1_src_value;
    	let t30;
    	let div23;
    	let h50;
    	let t32;
    	let p2;
    	let t34;
    	let div28;
    	let div27;
    	let img2;
    	let img2_src_value;
    	let t35;
    	let div26;
    	let h51;
    	let t37;
    	let p3;
    	let t39;
    	let div31;
    	let div30;
    	let img3;
    	let img3_src_value;
    	let t40;
    	let div29;
    	let h52;
    	let t42;
    	let p4;
    	let t44;
    	let section2;
    	let div34;
    	let svg1;
    	let polygon1;
    	let t45;
    	let div37;
    	let div36;
    	let div35;
    	let h21;
    	let t47;
    	let p5;
    	let t49;
    	let section3;
    	let div46;
    	let div45;
    	let div44;
    	let div43;
    	let div42;
    	let h43;
    	let t51;
    	let p6;
    	let t53;
    	let div38;
    	let label1;
    	let input1;
    	let t55;
    	let div39;
    	let label2;
    	let input2;
    	let t57;
    	let div40;
    	let label3;
    	let textarea;
    	let t59;
    	let div41;
    	let button0;
    	let t61;
    	let main1;
    	let footer;
    	let div47;
    	let svg2;
    	let polygon2;
    	let t62;
    	let div54;
    	let div50;
    	let div49;
    	let h44;
    	let t64;
    	let h53;
    	let t66;
    	let div48;
    	let button1;
    	let i3;
    	let button2;
    	let i4;
    	let button3;
    	let i5;
    	let t67;
    	let hr;
    	let t68;
    	let div53;
    	let div52;
    	let div51;
    	let current;
    	let mounted;
    	let dispose;
    	let if_block = /*visible*/ ctx[0] && create_if_block(ctx);

    	const block = {
    		c: function create() {
    			main0 = element("main");
    			div6 = element("div");
    			div0 = element("div");
    			span0 = element("span");
    			t0 = space();
    			div4 = element("div");
    			div3 = element("div");
    			div2 = element("div");
    			div1 = element("div");
    			h1 = element("h1");
    			t1 = text("Feel The ");
    			span1 = element("span");
    			span1.textContent = "Power";
    			t3 = space();
    			label0 = element("label");
    			input0 = element("input");
    			t4 = text("\n\t\t\t\tvisible");
    			t5 = space();
    			if (if_block) if_block.c();
    			t6 = space();
    			a = element("a");
    			a.textContent = "Download Brochure";
    			t8 = space();
    			div5 = element("div");
    			svg0 = svg_element("svg");
    			polygon0 = svg_element("polygon");
    			t9 = space();
    			section0 = element("section");
    			div20 = element("div");
    			div19 = element("div");
    			div7 = element("div");
    			img0 = element("img");
    			t10 = space();
    			div18 = element("div");
    			div17 = element("div");
    			small = element("small");
    			small.textContent = "About our gym";
    			t12 = space();
    			h3 = element("h3");
    			h3.textContent = "Safe Body Building";
    			t14 = space();
    			p0 = element("p");
    			p0.textContent = "The extension comes with three pre-built pages to help you get\n\t\t\t\t started faster. You can change the text and images and you're\n\t\t\t\t good to go.";
    			t16 = space();
    			ul = element("ul");
    			li0 = element("li");
    			div10 = element("div");
    			div8 = element("div");
    			span2 = element("span");
    			i0 = element("i");
    			t17 = space();
    			div9 = element("div");
    			h40 = element("h4");
    			h40.textContent = "The latest and greatest gym equipment";
    			t19 = space();
    			li1 = element("li");
    			div13 = element("div");
    			div11 = element("div");
    			span3 = element("span");
    			i1 = element("i");
    			t20 = space();
    			div12 = element("div");
    			h41 = element("h4");
    			h41.textContent = "5-inch, quality foam floor padding";
    			t22 = space();
    			li2 = element("li");
    			div16 = element("div");
    			div14 = element("div");
    			span4 = element("span");
    			i2 = element("i");
    			t23 = space();
    			div15 = element("div");
    			h42 = element("h4");
    			h42.textContent = "3 professional trainers";
    			t25 = space();
    			section1 = element("section");
    			div33 = element("div");
    			div22 = element("div");
    			div21 = element("div");
    			h20 = element("h2");
    			h20.textContent = "Meet Our Trainers";
    			t27 = space();
    			p1 = element("p");
    			p1.textContent = "Our trainers are are here to dedicate the time and effort that\n\t\t\t   you need to get in the best shape of your life";
    			t29 = space();
    			div32 = element("div");
    			div25 = element("div");
    			div24 = element("div");
    			img1 = element("img");
    			t30 = space();
    			div23 = element("div");
    			h50 = element("h5");
    			h50.textContent = "Mr Rogers";
    			t32 = space();
    			p2 = element("p");
    			p2.textContent = "Neighborhood Watchman";
    			t34 = space();
    			div28 = element("div");
    			div27 = element("div");
    			img2 = element("img");
    			t35 = space();
    			div26 = element("div");
    			h51 = element("h5");
    			h51.textContent = "Strawberry Shortcake";
    			t37 = space();
    			p3 = element("p");
    			p3.textContent = "Cupcake Smasher";
    			t39 = space();
    			div31 = element("div");
    			div30 = element("div");
    			img3 = element("img");
    			t40 = space();
    			div29 = element("div");
    			h52 = element("h5");
    			h52.textContent = "Ronald McDonald";
    			t42 = space();
    			p4 = element("p");
    			p4.textContent = "Double Whoopass With Cheese";
    			t44 = space();
    			section2 = element("section");
    			div34 = element("div");
    			svg1 = svg_element("svg");
    			polygon1 = svg_element("polygon");
    			t45 = space();
    			div37 = element("div");
    			div36 = element("div");
    			div35 = element("div");
    			h21 = element("h2");
    			h21.textContent = "Contact Us";
    			t47 = space();
    			p5 = element("p");
    			p5.textContent = "Contact us to ask any questions, aquire a membership, talk to\n\t\t\t   our trainers or anything else";
    			t49 = space();
    			section3 = element("section");
    			div46 = element("div");
    			div45 = element("div");
    			div44 = element("div");
    			div43 = element("div");
    			div42 = element("div");
    			h43 = element("h4");
    			h43.textContent = "Want to work with us?";
    			t51 = space();
    			p6 = element("p");
    			p6.textContent = "Complete this form and we will get back to you in 24 hours.";
    			t53 = space();
    			div38 = element("div");
    			label1 = element("label");
    			label1.textContent = "Full Name";
    			input1 = element("input");
    			t55 = space();
    			div39 = element("div");
    			label2 = element("label");
    			label2.textContent = "Email";
    			input2 = element("input");
    			t57 = space();
    			div40 = element("div");
    			label3 = element("label");
    			label3.textContent = "Message";
    			textarea = element("textarea");
    			t59 = space();
    			div41 = element("div");
    			button0 = element("button");
    			button0.textContent = "Send Message";
    			t61 = space();
    			main1 = element("main");
    			footer = element("footer");
    			div47 = element("div");
    			svg2 = svg_element("svg");
    			polygon2 = svg_element("polygon");
    			t62 = space();
    			div54 = element("div");
    			div50 = element("div");
    			div49 = element("div");
    			h44 = element("h4");
    			h44.textContent = "Follow us on social media";
    			t64 = space();
    			h53 = element("h5");
    			h53.textContent = "Find us on any of these platforms, we respond 1-2 business days.";
    			t66 = space();
    			div48 = element("div");
    			button1 = element("button");
    			i3 = element("i");
    			button2 = element("button");
    			i4 = element("i");
    			button3 = element("button");
    			i5 = element("i");
    			t67 = space();
    			hr = element("hr");
    			t68 = space();
    			div53 = element("div");
    			div52 = element("div");
    			div51 = element("div");
    			div51.textContent = "Copyright © The Power Room";
    			attr_dev(span0, "id", "blackOverlay");
    			attr_dev(span0, "class", "w-full h-full absolute opacity-75 bg-black");
    			add_location(span0, file, 17, 3, 1047);
    			attr_dev(div0, "class", "absolute top-0 w-full h-full bg-top bg-cover");
    			set_style(div0, "background-image", "url('https://images.unsplash.com/photo-1526506118085-60ce8714f8c5?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=2134&q=80')");
    			add_location(div0, file, 13, 4, 805);
    			attr_dev(span1, "class", "text-orange-500");
    			add_location(span1, file, 27, 14, 1410);
    			attr_dev(h1, "class", "text-white font-semibold text-5xl");
    			add_location(h1, file, 26, 6, 1349);
    			attr_dev(input0, "type", "checkbox");
    			add_location(input0, file, 30, 4, 1518);
    			attr_dev(label0, "class", "mt-4 text-lg text-gray-300");
    			add_location(label0, file, 29, 6, 1471);
    			attr_dev(a, "href", "https://svelte.dev/");
    			attr_dev(a, "class", "bg-transparent hover:bg-orange-500 text-orange-500 font-semibold hover:text-white p-4 border border-orange-500 hover:border-transparent rounded inline-block mt-5 cursor-pointer");
    			add_location(a, file, 38, 6, 1745);
    			add_location(div1, file, 25, 4, 1337);
    			attr_dev(div2, "class", "w-full lg:w-6/12 px-4 ml-auto mr-auto text-center");
    			add_location(div2, file, 24, 5, 1269);
    			attr_dev(div3, "class", "items-center flex flex-wrap");
    			add_location(div3, file, 23, 3, 1222);
    			attr_dev(div4, "class", "container relative mx-auto");
    			attr_dev(div4, "data-aos", "fade-in");
    			add_location(div4, file, 22, 4, 1159);
    			attr_dev(polygon0, "points", "2560 0 2560 100 0 100");
    			add_location(polygon0, file, 60, 5, 2418);
    			attr_dev(svg0, "class", "absolute bottom-0 overflow-hidden");
    			attr_dev(svg0, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg0, "preserveAspectRatio", "none");
    			attr_dev(svg0, "version", "1.1");
    			attr_dev(svg0, "viewBox", "0 0 2560 100");
    			attr_dev(svg0, "x", "0");
    			attr_dev(svg0, "y", "0");
    			add_location(svg0, file, 51, 3, 2215);
    			attr_dev(div5, "class", "top-auto bottom-0 left-0 right-0 w-full absolute pointer-events-none overflow-hidden");
    			set_style(div5, "height", "70px");
    			set_style(div5, "transform", "translateZ(0px)");
    			add_location(div5, file, 47, 4, 2053);
    			attr_dev(div6, "class", "relative pt-16 pb-32 flex content-center items-center justify-center");
    			set_style(div6, "min-height", "95vh");
    			add_location(div6, file, 9, 2, 682);
    			attr_dev(img0, "alt", "...");
    			attr_dev(img0, "class", "max-w-full rounded-lg shadow-lg");
    			if (img0.src !== (img0_src_value = /*src2*/ ctx[2])) attr_dev(img0, "src", img0_src_value);
    			add_location(img0, file, 73, 4, 2774);
    			attr_dev(div7, "class", "w-full md:w-4/12 ml-auto mr-auto px-4");
    			attr_dev(div7, "data-aos", "fade-right");
    			add_location(div7, file, 69, 5, 2682);
    			attr_dev(small, "class", "text-orange-500");
    			add_location(small, file, 84, 6, 3002);
    			attr_dev(h3, "class", "text-4xl uppercase font-bold");
    			add_location(h3, file, 85, 6, 3061);
    			attr_dev(p0, "class", "mt-4 text-lg leading-relaxed");
    			add_location(p0, file, 86, 6, 3132);
    			attr_dev(i0, "class", "fas fa-dumbbell fa-2x");
    			add_location(i0, file, 97, 8, 3535);
    			attr_dev(span2, "class", "font-semibold inline-block py-3 mr-3 text-orange-500");
    			add_location(span2, file, 95, 8, 3453);
    			add_location(div8, file, 94, 6, 3439);
    			attr_dev(h40, "class", "text-xl");
    			add_location(h40, file, 101, 8, 3622);
    			add_location(div9, file, 100, 6, 3608);
    			attr_dev(div10, "class", "flex items-center");
    			add_location(div10, file, 93, 7, 3401);
    			attr_dev(li0, "class", "py-2");
    			add_location(li0, file, 92, 5, 3376);
    			attr_dev(i1, "class", "fas fa-hard-hat fa-2x");
    			add_location(i1, file, 112, 8, 3904);
    			attr_dev(span3, "class", "font-semibold inline-block py-3 mr-3 text-orange-500");
    			add_location(span3, file, 110, 8, 3822);
    			add_location(div11, file, 109, 6, 3808);
    			attr_dev(h41, "class", "text-xl");
    			add_location(h41, file, 116, 8, 3991);
    			add_location(div12, file, 115, 6, 3977);
    			attr_dev(div13, "class", "flex items-center");
    			add_location(div13, file, 108, 7, 3770);
    			attr_dev(li1, "class", "py-2");
    			add_location(li1, file, 107, 5, 3745);
    			attr_dev(i2, "class", "fas fa-users fa-2x");
    			add_location(i2, file, 127, 8, 4270);
    			attr_dev(span4, "class", "font-semibold inline-block py-3 mr-3 text-orange-500");
    			add_location(span4, file, 125, 8, 4188);
    			add_location(div14, file, 124, 6, 4174);
    			attr_dev(h42, "class", "text-xl");
    			add_location(h42, file, 131, 8, 4354);
    			add_location(div15, file, 130, 6, 4340);
    			attr_dev(div16, "class", "flex items-center");
    			add_location(div16, file, 123, 7, 4136);
    			attr_dev(li2, "class", "py-2");
    			add_location(li2, file, 122, 5, 4111);
    			attr_dev(ul, "class", "list-none mt-6");
    			add_location(ul, file, 91, 6, 3343);
    			attr_dev(div17, "class", "md:pr-12");
    			add_location(div17, file, 83, 4, 2973);
    			attr_dev(div18, "class", "w-full md:w-5/12 ml-auto mr-auto px-4");
    			attr_dev(div18, "data-aos", "fade-left");
    			add_location(div18, file, 79, 5, 2882);
    			attr_dev(div19, "class", "items-center flex flex-wrap");
    			add_location(div19, file, 68, 3, 2635);
    			attr_dev(div20, "class", "container mx-auto px-4");
    			add_location(div20, file, 67, 4, 2595);
    			attr_dev(section0, "id", "about");
    			attr_dev(section0, "class", "relative py-20 bg-black text-white");
    			add_location(section0, file, 66, 2, 2527);
    			attr_dev(h20, "class", "text-4xl font-semibold uppercase");
    			add_location(h20, file, 147, 4, 4722);
    			attr_dev(p1, "class", "text-lg leading-relaxed m-4");
    			add_location(p1, file, 150, 4, 4806);
    			attr_dev(div21, "class", "w-full lg:w-6/12 px-4");
    			add_location(div21, file, 146, 5, 4682);
    			attr_dev(div22, "class", "flex flex-wrap justify-center text-center mb-24");
    			add_location(div22, file, 145, 3, 4615);
    			attr_dev(img1, "alt", "...");
    			if (img1.src !== (img1_src_value = /*src4*/ ctx[4])) attr_dev(img1, "src", img1_src_value);
    			attr_dev(img1, "class", "shadow-lg rounded max-w-full mx-auto");
    			set_style(img1, "max-width", "250px");
    			add_location(img1, file, 164, 6, 5205);
    			attr_dev(h50, "class", "text-xl font-bold");
    			add_location(h50, file, 171, 5, 5372);
    			attr_dev(p2, "class", "mt-1 text-sm text-gray-500 uppercase font-semibold");
    			add_location(p2, file, 172, 5, 5422);
    			attr_dev(div23, "class", "pt-6 text-center");
    			add_location(div23, file, 170, 6, 5336);
    			attr_dev(div24, "class", "px-6");
    			add_location(div24, file, 163, 4, 5180);
    			attr_dev(div25, "class", "w-full md:w-4/12 lg:mb-0 mb-12 px-4");
    			attr_dev(div25, "data-aos", "flip-right");
    			add_location(div25, file, 159, 5, 5090);
    			attr_dev(img2, "alt", "...");
    			if (img2.src !== (img2_src_value = /*src*/ ctx[1])) attr_dev(img2, "src", img2_src_value);
    			attr_dev(img2, "class", "shadow-lg rounded max-w-full mx-auto");
    			set_style(img2, "max-width", "250px");
    			add_location(img2, file, 184, 6, 5701);
    			attr_dev(h51, "class", "text-xl font-bold");
    			add_location(h51, file, 191, 5, 5867);
    			attr_dev(p3, "class", "mt-1 text-sm text-gray-500 uppercase font-semibold");
    			add_location(p3, file, 192, 5, 5928);
    			attr_dev(div26, "class", "pt-6 text-center");
    			add_location(div26, file, 190, 6, 5831);
    			attr_dev(div27, "class", "px-6");
    			add_location(div27, file, 183, 4, 5676);
    			attr_dev(div28, "class", "w-full md:w-4/12 lg:mb-0 mb-12 px-4");
    			attr_dev(div28, "data-aos", "flip-right");
    			add_location(div28, file, 179, 5, 5586);
    			attr_dev(img3, "alt", "...");
    			if (img3.src !== (img3_src_value = /*src3*/ ctx[3])) attr_dev(img3, "src", img3_src_value);
    			attr_dev(img3, "class", "shadow-lg rounded max-w-full mx-auto");
    			set_style(img3, "max-width", "250px");
    			add_location(img3, file, 204, 6, 6201);
    			attr_dev(h52, "class", "text-xl font-bold");
    			add_location(h52, file, 211, 5, 6368);
    			attr_dev(p4, "class", "mt-1 text-sm text-gray-500 uppercase font-semibold");
    			add_location(p4, file, 212, 5, 6424);
    			attr_dev(div29, "class", "pt-6 text-center");
    			add_location(div29, file, 210, 6, 6332);
    			attr_dev(div30, "class", "px-6");
    			add_location(div30, file, 203, 4, 6176);
    			attr_dev(div31, "class", "w-full md:w-4/12 lg:mb-0 mb-12 px-4");
    			attr_dev(div31, "data-aos", "flip-right");
    			add_location(div31, file, 199, 5, 6086);
    			attr_dev(div32, "class", "flex flex-wrap");
    			add_location(div32, file, 157, 3, 5035);
    			attr_dev(div33, "class", "container mx-auto px-4");
    			add_location(div33, file, 144, 4, 4575);
    			attr_dev(section1, "class", "pt-20 pb-48");
    			add_location(section1, file, 143, 2, 4541);
    			attr_dev(polygon1, "points", "2560 0 2560 100 0 100");
    			add_location(polygon1, file, 237, 5, 7074);
    			attr_dev(svg1, "class", "absolute bottom-0 overflow-hidden");
    			attr_dev(svg1, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg1, "preserveAspectRatio", "none");
    			attr_dev(svg1, "version", "1.1");
    			attr_dev(svg1, "viewBox", "0 0 2560 100");
    			attr_dev(svg1, "x", "0");
    			attr_dev(svg1, "y", "0");
    			add_location(svg1, file, 228, 3, 6871);
    			attr_dev(div34, "class", "bottom-auto top-0 left-0 right-0 w-full absolute pointer-events-none overflow-hidden -mt-20");
    			set_style(div34, "height", "80px");
    			set_style(div34, "transform", "translateZ(0px)");
    			add_location(div34, file, 224, 4, 6702);
    			attr_dev(h21, "class", "text-4xl font-semibold text-white uppercase");
    			add_location(h21, file, 243, 4, 7321);
    			attr_dev(p5, "class", "text-lg leading-relaxed mt-4 mb-4");
    			add_location(p5, file, 246, 4, 7409);
    			attr_dev(div35, "class", "w-full lg:w-6/12 px-4");
    			add_location(div35, file, 242, 5, 7281);
    			attr_dev(div36, "class", "flex flex-wrap text-center justify-center");
    			add_location(div36, file, 241, 3, 7220);
    			attr_dev(div37, "class", "container mx-auto px-4 lg:pt-24 lg:pb-64 pb-20 pt-20");
    			add_location(div37, file, 240, 4, 7150);
    			attr_dev(section2, "class", "pb-20 relative block bg-black text-white");
    			add_location(section2, file, 223, 2, 6639);
    			attr_dev(h43, "class", "text-2xl font-semibold");
    			add_location(h43, file, 265, 5, 8063);
    			attr_dev(p6, "class", "leading-relaxed mt-1 mb-4");
    			add_location(p6, file, 266, 5, 8130);
    			attr_dev(label1, "class", "block uppercase text-xs font-bold mb-2");
    			attr_dev(label1, "for", "full-name");
    			add_location(label1, file, 270, 7, 8297);
    			attr_dev(input1, "type", "text");
    			attr_dev(input1, "class", "px-3 py-3 placeholder-gray-400 bg-white rounded text-sm shadow focus:outline-none focus:shadow-outline w-full");
    			attr_dev(input1, "placeholder", "Full Name");
    			set_style(input1, "transition", "all 0.15s ease 0s");
    			add_location(input1, file, 274, 8, 8411);
    			attr_dev(div38, "class", "relative w-full mb-3 mt-8");
    			add_location(div38, file, 269, 5, 8250);
    			attr_dev(label2, "class", "block uppercase text-xs font-bold mb-2");
    			attr_dev(label2, "for", "email");
    			add_location(label2, file, 282, 7, 8703);
    			attr_dev(input2, "type", "email");
    			attr_dev(input2, "class", "px-3 py-3 placeholder-gray-400 bg-white rounded text-sm shadow focus:outline-none focus:shadow-outline w-full");
    			attr_dev(input2, "placeholder", "Email");
    			set_style(input2, "transition", "all 0.15s ease 0s");
    			add_location(input2, file, 286, 8, 8809);
    			attr_dev(div39, "class", "relative w-full mb-3");
    			add_location(div39, file, 281, 5, 8661);
    			attr_dev(label3, "class", "block uppercase text-xs font-bold mb-2");
    			attr_dev(label3, "for", "message");
    			add_location(label3, file, 294, 7, 9098);
    			attr_dev(textarea, "rows", "4");
    			attr_dev(textarea, "cols", "80");
    			attr_dev(textarea, "class", "px-3 py-3 placeholder-gray-400 bg-white rounded text-sm shadow focus:outline-none focus:shadow-outline w-full");
    			attr_dev(textarea, "placeholder", "Type a message...");
    			add_location(textarea, file, 298, 8, 9208);
    			attr_dev(div40, "class", "relative w-full mb-3");
    			add_location(div40, file, 293, 5, 9056);
    			attr_dev(button0, "class", "bg-gray-900 text-white active:bg-gray-700 text-sm font-bold uppercase px-6 py-3 rounded shadow hover:shadow-lg outline-none focus:outline-none mr-1 mb-1");
    			attr_dev(button0, "type", "button");
    			set_style(button0, "transition", "all 0.15s ease 0s");
    			add_location(button0, file, 306, 7, 9486);
    			attr_dev(div41, "class", "text-center mt-6");
    			add_location(div41, file, 305, 5, 9448);
    			attr_dev(div42, "class", "flex-auto p-5 lg:p-10 bg-orange-500 text-white");
    			add_location(div42, file, 264, 6, 7997);
    			attr_dev(div43, "class", "relative flex flex-col min-w-0 break-words w-full mb-6 shadow-lg rounded-lg bg-gray-300");
    			attr_dev(div43, "data-aos", "fade-up-right");
    			add_location(div43, file, 260, 4, 7847);
    			attr_dev(div44, "class", "w-full lg:w-6/12 px-4");
    			add_location(div44, file, 259, 5, 7807);
    			attr_dev(div45, "class", "flex flex-wrap justify-center lg:-mt-64 -mt-48");
    			add_location(div45, file, 258, 3, 7741);
    			attr_dev(div46, "class", "container mx-auto px-4");
    			add_location(div46, file, 257, 4, 7701);
    			attr_dev(section3, "class", "relative block py-24 lg:pt-0 bg-black");
    			add_location(section3, file, 256, 2, 7641);
    			add_location(main0, file, 8, 1, 673);
    			attr_dev(polygon2, "class", "text-gray-300 fill-current");
    			attr_dev(polygon2, "points", "2560 0 2560 100 0 100");
    			add_location(polygon2, file, 334, 3, 10295);
    			attr_dev(svg2, "class", "absolute bottom-0 overflow-hidden");
    			attr_dev(svg2, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg2, "preserveAspectRatio", "none");
    			attr_dev(svg2, "version", "1.1");
    			attr_dev(svg2, "viewBox", "0 0 2560 100");
    			attr_dev(svg2, "x", "0");
    			attr_dev(svg2, "y", "0");
    			add_location(svg2, file, 327, 4, 10111);
    			attr_dev(div47, "class", "bottom-auto top-0 left-0 right-0 w-full absolute pointer-events-none overflow-hidden -mt-20");
    			set_style(div47, "height", "80px");
    			set_style(div47, "transform", "translateZ(0px)");
    			add_location(div47, file, 324, 2, 9942);
    			attr_dev(h44, "class", "text-3xl font-semibold");
    			add_location(h44, file, 343, 5, 10531);
    			attr_dev(h53, "class", "text-lg mt-0 mb-2 text-gray-700");
    			add_location(h53, file, 344, 5, 10602);
    			attr_dev(i3, "class", "flex fab fa-twitter text-orange-500");
    			add_location(i3, file, 352, 6, 10959);
    			attr_dev(button1, "class", "bg-white text-blue-400 shadow-lg font-normal h-10 w-10 items-center justify-center align-center rounded-full outline-none focus:outline-none mr-2 p-3");
    			attr_dev(button1, "type", "button");
    			add_location(button1, file, 348, 4, 10755);
    			attr_dev(i4, "class", "flex fab fa-facebook-square text-orange-500");
    			add_location(i4, file, 357, 6, 11228);
    			attr_dev(button2, "class", "bg-white text-blue-600 shadow-lg font-normal h-10 w-10 items-center justify-center align-center rounded-full outline-none focus:outline-none mr-2 p-3");
    			attr_dev(button2, "type", "button");
    			add_location(button2, file, 353, 5, 11024);
    			attr_dev(i5, "class", "flex fab fa-linkedin text-orange-500");
    			add_location(i5, file, 364, 6, 11517);
    			attr_dev(button3, "class", "bg-white text-pink-400 shadow-lg font-normal h-10 w-10 items-center justify-center align-center rounded-full outline-none focus:outline-none mr-2 p-3");
    			attr_dev(button3, "type", "button");
    			add_location(button3, file, 360, 5, 11313);
    			attr_dev(div48, "class", "mt-6");
    			add_location(div48, file, 347, 5, 10732);
    			attr_dev(div49, "class", "w-full lg:w-6/12 px-4");
    			add_location(div49, file, 342, 3, 10490);
    			attr_dev(div50, "class", "flex flex-wrap");
    			add_location(div50, file, 341, 4, 10458);
    			attr_dev(hr, "class", "my-6 border-gray-400");
    			add_location(hr, file, 369, 4, 11621);
    			attr_dev(div51, "class", "text-sm text-gray-600 font-semibold py-1");
    			add_location(div51, file, 372, 5, 11803);
    			attr_dev(div52, "class", "w-full md:w-4/12 px-4 mx-auto text-center");
    			add_location(div52, file, 371, 3, 11742);
    			attr_dev(div53, "class", "flex flex-wrap items-center md:justify-between justify-center");
    			add_location(div53, file, 370, 4, 11661);
    			attr_dev(div54, "class", "container mx-auto px-4");
    			add_location(div54, file, 340, 2, 10417);
    			attr_dev(footer, "class", "relative bg-gray-300 pt-8 pb-6");
    			add_location(footer, file, 323, 3, 9892);
    			add_location(main1, file, 322, 3, 9882);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, main0, anchor);
    			append_dev(main0, div6);
    			append_dev(div6, div0);
    			append_dev(div0, span0);
    			append_dev(div6, t0);
    			append_dev(div6, div4);
    			append_dev(div4, div3);
    			append_dev(div3, div2);
    			append_dev(div2, div1);
    			append_dev(div1, h1);
    			append_dev(h1, t1);
    			append_dev(h1, span1);
    			append_dev(div1, t3);
    			append_dev(div1, label0);
    			append_dev(label0, input0);
    			input0.checked = /*visible*/ ctx[0];
    			append_dev(label0, t4);
    			append_dev(div1, t5);
    			if (if_block) if_block.m(div1, null);
    			append_dev(div1, t6);
    			append_dev(div1, a);
    			append_dev(div6, t8);
    			append_dev(div6, div5);
    			append_dev(div5, svg0);
    			append_dev(svg0, polygon0);
    			append_dev(main0, t9);
    			append_dev(main0, section0);
    			append_dev(section0, div20);
    			append_dev(div20, div19);
    			append_dev(div19, div7);
    			append_dev(div7, img0);
    			append_dev(div19, t10);
    			append_dev(div19, div18);
    			append_dev(div18, div17);
    			append_dev(div17, small);
    			append_dev(div17, t12);
    			append_dev(div17, h3);
    			append_dev(div17, t14);
    			append_dev(div17, p0);
    			append_dev(div17, t16);
    			append_dev(div17, ul);
    			append_dev(ul, li0);
    			append_dev(li0, div10);
    			append_dev(div10, div8);
    			append_dev(div8, span2);
    			append_dev(span2, i0);
    			append_dev(div10, t17);
    			append_dev(div10, div9);
    			append_dev(div9, h40);
    			append_dev(ul, t19);
    			append_dev(ul, li1);
    			append_dev(li1, div13);
    			append_dev(div13, div11);
    			append_dev(div11, span3);
    			append_dev(span3, i1);
    			append_dev(div13, t20);
    			append_dev(div13, div12);
    			append_dev(div12, h41);
    			append_dev(ul, t22);
    			append_dev(ul, li2);
    			append_dev(li2, div16);
    			append_dev(div16, div14);
    			append_dev(div14, span4);
    			append_dev(span4, i2);
    			append_dev(div16, t23);
    			append_dev(div16, div15);
    			append_dev(div15, h42);
    			append_dev(main0, t25);
    			append_dev(main0, section1);
    			append_dev(section1, div33);
    			append_dev(div33, div22);
    			append_dev(div22, div21);
    			append_dev(div21, h20);
    			append_dev(div21, t27);
    			append_dev(div21, p1);
    			append_dev(div33, t29);
    			append_dev(div33, div32);
    			append_dev(div32, div25);
    			append_dev(div25, div24);
    			append_dev(div24, img1);
    			append_dev(div24, t30);
    			append_dev(div24, div23);
    			append_dev(div23, h50);
    			append_dev(div23, t32);
    			append_dev(div23, p2);
    			append_dev(div32, t34);
    			append_dev(div32, div28);
    			append_dev(div28, div27);
    			append_dev(div27, img2);
    			append_dev(div27, t35);
    			append_dev(div27, div26);
    			append_dev(div26, h51);
    			append_dev(div26, t37);
    			append_dev(div26, p3);
    			append_dev(div32, t39);
    			append_dev(div32, div31);
    			append_dev(div31, div30);
    			append_dev(div30, img3);
    			append_dev(div30, t40);
    			append_dev(div30, div29);
    			append_dev(div29, h52);
    			append_dev(div29, t42);
    			append_dev(div29, p4);
    			append_dev(main0, t44);
    			append_dev(main0, section2);
    			append_dev(section2, div34);
    			append_dev(div34, svg1);
    			append_dev(svg1, polygon1);
    			append_dev(section2, t45);
    			append_dev(section2, div37);
    			append_dev(div37, div36);
    			append_dev(div36, div35);
    			append_dev(div35, h21);
    			append_dev(div35, t47);
    			append_dev(div35, p5);
    			append_dev(main0, t49);
    			append_dev(main0, section3);
    			append_dev(section3, div46);
    			append_dev(div46, div45);
    			append_dev(div45, div44);
    			append_dev(div44, div43);
    			append_dev(div43, div42);
    			append_dev(div42, h43);
    			append_dev(div42, t51);
    			append_dev(div42, p6);
    			append_dev(div42, t53);
    			append_dev(div42, div38);
    			append_dev(div38, label1);
    			append_dev(div38, input1);
    			append_dev(div42, t55);
    			append_dev(div42, div39);
    			append_dev(div39, label2);
    			append_dev(div39, input2);
    			append_dev(div42, t57);
    			append_dev(div42, div40);
    			append_dev(div40, label3);
    			append_dev(div40, textarea);
    			append_dev(div42, t59);
    			append_dev(div42, div41);
    			append_dev(div41, button0);
    			insert_dev(target, t61, anchor);
    			insert_dev(target, main1, anchor);
    			append_dev(main1, footer);
    			append_dev(footer, div47);
    			append_dev(div47, svg2);
    			append_dev(svg2, polygon2);
    			append_dev(footer, t62);
    			append_dev(footer, div54);
    			append_dev(div54, div50);
    			append_dev(div50, div49);
    			append_dev(div49, h44);
    			append_dev(div49, t64);
    			append_dev(div49, h53);
    			append_dev(div49, t66);
    			append_dev(div49, div48);
    			append_dev(div48, button1);
    			append_dev(button1, i3);
    			append_dev(div48, button2);
    			append_dev(button2, i4);
    			append_dev(div48, button3);
    			append_dev(button3, i5);
    			append_dev(div54, t67);
    			append_dev(div54, hr);
    			append_dev(div54, t68);
    			append_dev(div54, div53);
    			append_dev(div53, div52);
    			append_dev(div52, div51);
    			current = true;

    			if (!mounted) {
    				dispose = listen_dev(input0, "change", /*input0_change_handler*/ ctx[5]);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*visible*/ 1) {
    				input0.checked = /*visible*/ ctx[0];
    			}

    			if (/*visible*/ ctx[0]) {
    				if (if_block) {
    					if (dirty & /*visible*/ 1) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(div1, t6);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(main0);
    			if (if_block) if_block.d();
    			if (detaching) detach_dev(t61);
    			if (detaching) detach_dev(main1);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("App", slots, []);
    	let visible = true;
    	let src = "https://images.unsplash.com/photo-1594381898411-846e7d193883?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=500&q=60";
    	let src2 = "https://images.unsplash.com/photo-1550345332-09e3ac987658?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=634&q=80";
    	let src3 = "https://images.unsplash.com/photo-1567013127542-490d757e51fc?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=634&q=80";
    	let src4 = "https://images.unsplash.com/photo-1597347343908-2937e7dcc560?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=634&q=80";
    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<App> was created with unknown prop '${key}'`);
    	});

    	function input0_change_handler() {
    		visible = this.checked;
    		$$invalidate(0, visible);
    	}

    	$$self.$capture_state = () => ({
    		fade,
    		fly,
    		visible,
    		src,
    		src2,
    		src3,
    		src4
    	});

    	$$self.$inject_state = $$props => {
    		if ("visible" in $$props) $$invalidate(0, visible = $$props.visible);
    		if ("src" in $$props) $$invalidate(1, src = $$props.src);
    		if ("src2" in $$props) $$invalidate(2, src2 = $$props.src2);
    		if ("src3" in $$props) $$invalidate(3, src3 = $$props.src3);
    		if ("src4" in $$props) $$invalidate(4, src4 = $$props.src4);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [visible, src, src2, src3, src4, input0_change_handler];
    }

    class App extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "App",
    			options,
    			id: create_fragment.name
    		});
    	}
    }

    const app = new App({
        target: document.body,
        props: {}
    });

    return app;

}());
//# sourceMappingURL=bundle.js.map
