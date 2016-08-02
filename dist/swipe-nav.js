(function (global, factory) {
    if (typeof define === "function" && define.amd) {
        define(['module', 'exports'], factory);
    } else if (typeof exports !== "undefined") {
        factory(module, exports);
    } else {
        var mod = {
            exports: {}
        };
        factory(mod, mod.exports);
        global.swipeNav = mod.exports;
    }
})(this, function (module, exports) {
    'use strict';

    Object.defineProperty(exports, "__esModule", {
        value: true
    });

    function _classCallCheck(instance, Constructor) {
        if (!(instance instanceof Constructor)) {
            throw new TypeError("Cannot call a class as a function");
        }
    }

    var _createClass = function () {
        function defineProperties(target, props) {
            for (var i = 0; i < props.length; i++) {
                var descriptor = props[i];
                descriptor.enumerable = descriptor.enumerable || false;
                descriptor.configurable = true;
                if ("value" in descriptor) descriptor.writable = true;
                Object.defineProperty(target, descriptor.key, descriptor);
            }
        }

        return function (Constructor, protoProps, staticProps) {
            if (protoProps) defineProperties(Constructor.prototype, protoProps);
            if (staticProps) defineProperties(Constructor, staticProps);
            return Constructor;
        };
    }();

    // differences with swipe
    // - only touch support (no mouse)
    // - no slideshow support
    // - no continuous support for 2 slides
    // - intended use: full screen navigation component
    // - support css to trigger animation inside slides efficiently
    // - heavy use of requestAnimationFrame -> performance
    // - limit the number of redraws aggressively -> performance
    // - mobile-friendly: my device skips the first few touched pixels - animate that away
    // - ES6 only
    // - no prefixes for css properties

    /*
        .swipe-nav {
            overflow: hidden;
            visibility: hidden;
            position: relative;
        }
        .swipe-nav-wrap {
            overflow: hidden;
            position: relative;
        }
        .swipe-nav-wrap > div {
            float: left;
            width: 100%;
            position: relative;
        }
    */

    // create a mouse click event on element
    function simulateClick(element) {
        var event = new MouseEvent('click', {
            view: window,
            bubbles: true,
            cancelable: true
        });

        element.dispatchEvent(event);
    }

    /**
     * Low-level swipe component.
     */

    var SwipeNav = function () {
        _createClass(SwipeNav, null, [{
            key: 'create',
            value: function create(options) {
                return new SwipeNav(options);
            }
        }]);

        // use .create instead
        function SwipeNav(options) {
            _classCallCheck(this, SwipeNav);

            // DOM nodes
            this._container = options.container;
            this._element = this._container.children[0];
            this._slides = Array.prototype.slice.call(this._element.children);

            // event callbacks (bound methods)
            this._resizeCallback = this._resize.bind(this);
            this._touchStartCallback = this._touchStart.bind(this);
            this._touchMoveCallback = this._touchMove.bind(this);
            this._touchEndCallback = this._touchEnd.bind(this);

            // constants
            this._SLIDE_MASS = 1;
            this._SWIPE_ENERGY_THRESHOLD = 0.25;
            this._CLICK_ENERGY_THRESHOLD = 0.03;
            this._CLICK_TIME_MAX = 350;

            // render state
            this._animationFrameId = null; // current touchmove animation frame
            this._width = 0; // window width

            this._startX = null; // touch start pageX
            this._startY = null; // touch start pageY
            this._startTime = null; // touch start timestamp
            this._isScrolling = null;

            this._deltaX = null; // horizontal distance from touch start
            this._deltaY = null; // vertical distance from touch start
            this._deltaT = null; // time since swipe start
            this._distance = null; // actual horizontal slide movement
            this._velocity = 0; // current horizontal (X) velocity
            this._energy = 0; // energy applied during a swipe

            this._slideIndex = options.slideIndex || 0; // currently displayed slide
            this._slidePositions = [];

            // custom animation functions executed during a swipe gesture
            this._animationCallbacks = [];

            // set artificial swipe bounds
            this._isSwipeLeftAllowed = true;
            this._isSwipeRightAllowed = true;

            this.setup();
        }

        // permanently (update _slidePositions) move a slide to targetPosition


        _createClass(SwipeNav, [{
            key: '_moveSlide',
            value: function _moveSlide(index, targetPosition, duration) {
                var slide = this._slides[index];

                if (!slide) {
                    return;
                }

                this._slidePositions[index] = targetPosition;

                slide.style.transitionDuration = (duration || 0) + 'ms';
                slide.style.transform = 'translateX(' + targetPosition + 'px)';
            }
        }, {
            key: '_translateSlide',
            value: function _translateSlide(index, distance, duration) {
                var slide = this._slides[index];

                if (!slide) {
                    return;
                }

                slide.style.transitionDuration = (duration || 0) + 'ms';
                slide.style.transform = 'translateX(' + (this._slidePositions[index] + distance) + 'px)';
            }
        }, {
            key: '_executeAnimations',
            value: function _executeAnimations(relativeDistance, duration) {
                for (var i = 0; i < this._animationCallbacks.length; i++) {
                    this._animationCallbacks[i](relativeDistance, duration);
                }
            }
        }, {
            key: '_touchStart',
            value: function _touchStart(event) {
                // disable the default action (zoom) to not loose the first few move
                // events - loosing them results in a badly stuttering swipe start
                event.preventDefault();

                // get initial touch points (for delta computation)
                this._startX = event.touches[0].pageX;
                this._startY = event.touches[0].pageY;

                // reset all other points
                this._startTime = event.timeStamp;
                this._isScrolling = null;
                this._deltaX = 0;
                this._deltaY = 0;
                this._deltaT = 0;
                this._distance = 0;
                this._velocity = 0;
                this._energy = 0;

                // attach listeners
                this._element.addEventListener('touchmove', this._touchMoveCallback, false);
                this._element.addEventListener('touchend', this._touchEndCallback, false);
            }
        }, {
            key: '_touchMove',
            value: function _touchMove(event) {
                var _this = this;

                // ensure swiping with one touch and not pinching
                if (event.touches.length > 1 || event.scale && event.scale !== 1) {
                    // TODO: better way of stopping this?
                    // should touch event listeners (move, end) be removed here?
                    return;
                }

                var prevDeltaX = this._deltaX;

                // measure change in x and y
                this._deltaX = event.touches[0].pageX - this._startX;
                this._deltaY = event.touches[0].pageY - this._startY;

                // determine if scrolling test has run - one time test
                if (this._isScrolling === null) {
                    this._isScrolling = Math.abs(this._deltaX) < Math.abs(this._deltaY);
                }

                if (this._isScrolling) {
                    // TODO: also remove listeners here?
                    return;
                }

                // prevent native scrolling
                event.preventDefault();

                // skip this frame if deltaX has not been changed to not cause needless redraws
                if (prevDeltaX === this._deltaX) {
                    return;
                }

                // check boundaries and apply a resistance

                // swiping === moving your thumb over the screen
                // - isSwipingLeft: move thumb to the left - new slide comes from the right
                // - isWwipingRight: move thumb to the right - slide comes from the left
                var isSwipingLeft = this._deltaX < 0; // <---(thumb)
                var isSwipingRight = this._deltaX > 0; // (thumb)--->

                var isFirstSlide = this._slideIndex === 0;
                var isLastSlide = this._slideIndex === this._slides.length - 1;

                // TODO: compute these via callback on touchStart
                // or provide methods .setSlidingLeftAllowed or setSlidePermissions({left:true, right:false})
                var isSwipingLeftAllowed = true;
                var isSwipingRightAllowed = true;

                var applyResistance = isSwipingRight && (isFirstSlide || !isSwipingRightAllowed) || isSwipingLeft && (isLastSlide || !isSwipingLeftAllowed);

                if (applyResistance) {
                    this._distance = this._deltaX / (Math.abs(this._deltaX) / this._width + 1);
                } else {
                    this._distance = this._deltaX;
                }

                var prevDeltaT = this._deltaT;
                var prevVelocity = this._velocity || 0;

                this._deltaT = event.timeStamp - this._startTime;
                this._velocity = (this._deltaX - prevDeltaX) / (this._deltaT - prevDeltaT);

                // Compute the energy applied while swiping to create slides that
                // behave like a *real* thing using classical mechanics:
                //   Force = Mass * Acceleration
                //   Acceleration = deltaVelocity / deltaT
                //   Energy = F over time ~= sum(F * deltaT) = sum(m * a * deltaT) = sum(m * deltaVelocity)
                this._energy += (this._velocity - prevVelocity) * this._SLIDE_MASS;

                // render changes in a new frame unless we are already waiting for one
                // (mobile devices seem to fire touch events really fast, faster than
                //  screen refresh and even when not moving the thumb)
                if (this._animationFrameId === null) {
                    this._animationFrameId = window.requestAnimationFrame(function () {
                        // move slides
                        _this._translateSlide(_this._slideIndex - 1, _this._distance, 0);
                        _this._translateSlide(_this._slideIndex, _this._distance, 0);
                        _this._translateSlide(_this._slideIndex + 1, _this._distance, 0);

                        // animations
                        _this._executeAnimations(_this._distance / _this._width, 0);

                        // mark this frame as done and allow a new one to be requested
                        _this._animationFrameId = null;
                    });
                }
            }
        }, {
            key: '_touchEnd',
            value: function _touchEnd(event) {
                var _this2 = this;

                var isSwipingLeft = this._distance < 0;
                var isSwipingRight = this._distance > 0;

                // did the touch gesture apply enough energy to move the slide
                var isValidSwipeGesture = Math.abs(this._energy) > this._SWIPE_ENERGY_THRESHOLD;

                // is there anything to show?
                var isSwipePossible = isSwipingRight && this._slideIndex !== 0 && this._isSwipeRightAllowed || isSwipingLeft && this._slideIndex !== this._slides.length - 1 && this._isSwipeLeftAllowed;

                // click detection
                var hasNotMoved = Math.abs(this._energy) < this._CLICK_ENERGY_THRESHOLD;
                var isShortTouch = event.timeStamp - this._startTime < this._CLICK_TIME_MAX;

                // cleanup

                // remove listeners
                this._element.removeEventListener('touchmove', this._touchMoveCallback, false);
                this._element.removeEventListener('touchend', this._touchEndCallback, false);

                // cancel any existing translate draws
                if (this._animationFrameId !== null) {
                    window.cancelAnimationFrame(this._animationFrameId);
                    this._animationFrameId = null;
                }

                // reset swipe boundaries
                this._isSwipeLeftAllowed = true;
                this._isSwipeRightAllowed = true;

                // final actions

                if (this._isScrolling) {
                    return;
                }

                if (hasNotMoved && isShortTouch) {
                    simulateClick(event.target);
                }

                // finish the swipe using a css transition
                window.requestAnimationFrame(function () {
                    // Use the current (kinetic) energy of the slide to project its velocity via:
                    //   Energy = 0.5 * Mass * Velocity => Velocity = sqrt(Energy / 0.5*Mass)
                    //   Velocity = Distance / Time => Time = Distance / Velocity
                    // and reorder the equation to get time we need for the css transition.
                    var remainingDistance = Math.max(0, _this2._width - Math.abs(_this2._deltaX));
                    var transitionVelocity = Math.sqrt(Math.abs(_this2._energy) / (0.5 * _this2._SLIDE_MASS));
                    var transitionTime = remainingDistance / transitionVelocity;

                    if (isValidSwipeGesture && isSwipePossible) {
                        if (isSwipingLeft) {
                            _this2._moveSlide(_this2._slideIndex - 1, -_this2._width, 0);
                            _this2._moveSlide(_this2._slideIndex, _this2._slidePositions[_this2._slideIndex] - _this2._width, transitionTime);
                            _this2._moveSlide(_this2._slideIndex + 1, _this2._slidePositions[_this2._slideIndex + 1] - _this2._width, transitionTime);
                            _this2._executeAnimations(-1, transitionTime);
                            _this2._slideIndex += 1;
                        } else {
                            _this2._moveSlide(_this2._slideIndex + 1, _this2._width, 0);
                            _this2._moveSlide(_this2._slideIndex, _this2._slidePositions[_this2._slideIndex] + _this2._width, transitionTime);
                            _this2._moveSlide(_this2._slideIndex - 1, _this2._slidePositions[_this2._slideIndex - 1] + _this2._width, transitionTime);
                            _this2._executeAnimations(1, transitionTime);
                            _this2._slideIndex -= 1;
                        }
                    } else {
                        // move slides back into their current position
                        _this2._moveSlide(_this2._slideIndex - 1, -_this2._width, 300);
                        _this2._moveSlide(_this2._slideIndex, 0, 300);
                        _this2._moveSlide(_this2._slideIndex + 1, _this2._width, 300);
                        _this2._executeAnimations(0, 300);
                    }

                    _this2._animationCallbacks = [];
                });
            }
        }, {
            key: '_resize',
            value: function _resize() {
                this.kill();
                this.setup();
            }
        }, {
            key: 'setup',
            value: function setup() {
                var _this3 = this;

                this._width = this._container.getBoundingClientRect().width || this._container.offsetWidth;

                // set container width
                this._element.style.width = this._slides.length * this._width * 2 + 'px';

                // setup slides and remember slide positions
                this._slidePositions = new Array(this._slides.length);
                this._slides.forEach(function (slide, index) {
                    slide.style.width = _this3._width + 'px';
                    slide.setAttribute('data-index', index);

                    // stack each slide
                    slide.style.left = index * -_this3._width + 'px';

                    // divide the stack into three: left, right, center
                    var position = void 0;

                    if (_this3._slideIndex > index) {
                        position = -_this3._width; // left
                    } else if (_this3._slideIndex < index) {
                        position = _this3._width; // right
                    } else {
                        position = 0; // center
                    }

                    _this3._moveSlide(index, position, 0);
                });

                // setup event listeners
                this._element.addEventListener('touchstart', this._touchStartCallback, false);
                window.addEventListener('resize', this._resizeCallback, false);

                // done
                this._container.style.visibility = 'visible';
            }
        }, {
            key: 'kill',
            value: function kill() {
                var _this4 = this;

                // reset element
                this._element.style.width = '';
                this._element.style.left = '';

                // reset slides
                this._slides.forEach(function (slide, index) {
                    slide.style.width = '';
                    slide.style.left = '';
                    _this4._moveSlide(index, 0, 0);
                });

                // remove event listeners
                this._element.removeEventListener('touchstart', this._touchStartCallback, false);
                this._element.removeEventListener('touchmove', this._touchMoveCallback, false);
                this._element.removeEventListener('touchend', this._touchEndCallback, false);
                window.removeEventListener('resize', this._resizeCallback);
            }
        }, {
            key: 'setIsContentAvailable',
            value: function setIsContentAvailable(_ref) {
                var left = _ref.left;
                var right = _ref.right;

                this._isSwipeLeftAllowed = right;
                this._isSwipeRightAllowed = left;
            }
        }, {
            key: 'setAnimations',
            value: function setAnimations(animationCallbacks) {
                this._animationCallbacks = animationCallbacks;
            }
        }]);

        return SwipeNav;
    }();

    exports.default = SwipeNav;
    module.exports = exports['default'];
});

