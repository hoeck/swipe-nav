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

let counts = 0;
function debug () {
    document.getElementById('a').innerText = counts++;
}

let counts2 = 0;
function debug2 () {
    document.getElementById('b').innerText = counts2++;
}

function debugmsg (msg) {
    document.getElementById('b').innerText = msg;
}

function debugmsg2 (msg) {
    document.getElementById('c').innerText = msg;
}

class SwipeNav {

    constructor (options) {
        // DOM nodes
        this._container = options.container;
        this._element = this._container.children[0];
        this._slides = Array.prototype.slice.call(this._element.children);

        // event callbacks (bound methods)
        this._resizeCallback = this._resize.bind(this);
        this._touchStartCallback = this._touchStart.bind(this);
        this._touchMoveCallback = this._touchMove.bind(this);
        this._touchEndCallback = this._touchEnd.bind(this);

        this._SLIDE_MASS = 1;
        this._SWIPE_ENERGY_THRESHOLD = 0.25;

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

        this._slideIndex = 0; // currently displayed slide
        this._slidePositions = [];

        this.setup();
    }

    // permanently (update _slidePositions) move a slide to targetPosition
    _moveSlide (index, targetPosition, speed) {
        const slide = this._slides[index];

        if (!slide) {
            return;
        }

        this._slidePositions[index] = targetPosition;

        slide.style.transitionDuration = `${speed || 0}ms`;
        slide.style.transform = `translateX(${targetPosition}px)`;
    }

    // move a slide temporarily by distance pixels relative to their current
    // permanent position
    _translateSlide (index, distance, speed) {
        const slide = this._slides[index];

        if (!slide) {
            return;
        }

        slide.style.transitionDuration = `${speed || 0}ms`;
        slide.style.transform = `translateX(${this._slidePositions[index] + distance}px)`;
    }

    // event callback methods
    _touchStart (event) {
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

    _touchMove (event) {
        // ensure swiping with one touch and not pinching
        if (event.touches.length > 1 || event.scale && event.scale !== 1) {
            // TODO: better way of stopping this?
            // should touch event listeners (move, end) be removed here?
            return;
        }

        const prevDeltaX = this._deltaX;

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
        const isSwipingLeft = this._deltaX < 0; // <---(thumb)
        const isSwipingRight = this._deltaX > 0; // (thumb)--->

        const isFirstSlide = this._slideIndex === 0;
        const isLastSlide = this._slideIndex === this._slides.length - 1;

        // TODO: compute these via callback on touchStart
        // or provide methods .setSlidingLeftAllowed or setSlidePermissions({left:true, right:false})
        const isSwipingLeftAllowed = true;
        const isSwipingRightAllowed = true;

        const applyResistance =
                  (isSwipingRight && (isFirstSlide || !isSwipingRightAllowed))
                  || (isSwipingLeft && (isLastSlide || !isSwipingLeftAllowed));

        if (applyResistance) {
            this._distance = this._deltaX / (Math.abs(this._deltaX) / this._width + 1);
        } else {
            this._distance = this._deltaX;
        }

        const prevDeltaT = this._deltaT;
        const prevVelocity = this._velocity || 0;

        this._deltaT = event.timeStamp - this._startTime;
        this._velocity = (this._deltaX - prevDeltaX) / (this._deltaT - prevDeltaT);

        // Compute the energy applied while swiping to create slides that
        // behave like a *real* thing using classical mechanics:
        //   Force = Mass * Acceleration
        //   Acceleration = deltaVelocity / deltaT
        //   Energy = F over time ~= sum(F * deltaT) = sum(m * a * deltaT) = sum(m * deltaVelocity)
        this._energy += (this._velocity - prevVelocity) * this._SLIDE_MASS;
        debugmsg(`${this._energy}`);

        // render changes in a new frame unless we are already waiting for one
        // (mobile devices seem to fire touch events really fast, faster than
        //  screen refresh and even when not moving the thumb)
        if (this._animationFrameId === null) {
            this._animationFrameId = window.requestAnimationFrame(() => {
                this._translateSlide(this._slideIndex-1, this._distance, 0);
                this._translateSlide(this._slideIndex, this._distance, 0);
                this._translateSlide(this._slideIndex+1, this._distance, 0);
                this._animationFrameId = null;
            });
        }
    }

    _touchEnd (event) {
        if (this._isScrolling) {
            return;
        }

        const duration = this._deltaT;
        const isSwipingLeft = this._distance < 0;
        const isSwipingRight = this._distance > 0;

        // did the touch gesture apply enough energy to move the slide
        const isValidSwipeGesture = Math.abs(this._energy) > this._SWIPE_ENERGY_THRESHOLD;

        const isSwipingLeftAllowed = true;
        const isSwipingRightAllowed = true;

        const isSwipingPossible =
                  (isSwipingRight
                   && this._slideIndex !== 0
                   && isSwipingRightAllowed)
                  ||
                  (isSwipingLeft
                   && this._slideIndex !== this._slides.length -1
                   && isSwipingLeftAllowed);

        // remove listeners
        this._element.removeEventListener('touchmove', this._touchMoveCallback, false);
        this._element.removeEventListener('touchend', this._touchEndCallback, false);

        // cancel any existing translate draws
        if (this._animationFrameId !== null) {
            window.cancelAnimationFrame(this._animationFrameId);
            this._animationFrameId = null;
        }

        // finish the swipe using a css transition
        window.requestAnimationFrame(() => {
            // Use the current (kinetic) energy of the slide to project its velocity via:
            //   Energy = 0.5 * Mass * Velocity => Velocity = sqrt(Energy / 0.5*Mass)
            //   Velocity = Distance / Time => Time = Distance / Velocity
            // and reorder the equation to get time we need for the css transition.
            const remainingDistance = Math.max(0, this._width - Math.abs(this._deltaX));
            const transitionVelocity = Math.sqrt(Math.abs(this._energy) / (0.5 * this._SLIDE_MASS));
            const transitionTime =  remainingDistance / transitionVelocity;

            if (isValidSwipeGesture && isSwipingPossible) {
                if (isSwipingLeft) {
                    this._moveSlide(this._slideIndex-1, -this._width, 0);
                    this._moveSlide(this._slideIndex, this._slidePositions[this._slideIndex] - this._width, transitionTime);
                    this._moveSlide(this._slideIndex+1, this._slidePositions[this._slideIndex+1] - this._width, transitionTime);
                    this._slideIndex += 1;
                } else {
                    this._moveSlide(this._slideIndex+1, this._width, 0);
                    this._moveSlide(this._slideIndex, this._slidePositions[this._slideIndex] + this._width, transitionTime);
                    this._moveSlide(this._slideIndex-1, this._slidePositions[this._slideIndex-1] + this._width, transitionTime);
                    this._slideIndex -= 1;
                }
            } else {
                // move slides back into their current position
                this._moveSlide(this._slideIndex-1, -this._width, 300);
                this._moveSlide(this._slideIndex, 0, 300);
                this._moveSlide(this._slideIndex+1, this._width, 300);
            }
        });
    }

    _resize (event) {
        this.kill();
        this.setup();
    }

    setup () {
        this._width = this._container.getBoundingClientRect().width || this._container.offsetWidth;

        // set container width
        this._element.style.width = `${this._slides.length * this._width * 2}px`;

        // setup slides and remember slide positions
        this._slidePositions = new Array(this._slides.length);
        this._slides.forEach((slide, index) => {
            slide.style.width = `${this._width}px`;
            slide.setAttribute('data-index', index);

            // stack each slide
            slide.style.left = `${index * - this._width}px`;

            // divide the stack into three: left, right, center

            this._moveSlide(
                index,
                this._slideIndex > index ? -this._width : (this._slideIndex < index ? this._width : 0),
                0
            );
        });

        // setup event listeners
        this._element.addEventListener('touchstart', this._touchStartCallback, false);
        window.addEventListener('resize', this._resizeCallback, false);

        // done
        this._container.style.visibility = 'visible';
    }

    kill () {
        // reset element
        this._element.style.width = '';
        this._element.style.left = '';

        // reset slides
        this._slides.forEach((slide, index) => {
            slide.style.width = '';
            slide.style.left = '';
            this._moveSlide(index, 0, 0);
        });

        // remove event listeners
        this._element.removeEventListener('touchstart', this._touchStartCallback, false);
        this._element.removeEventListener('touchstart', this._touchMoveCallback, false);
        this._element.removeEventListener('touchstart', this._touchEndCallback, false);
        window.removeEventListener('resize', this._resizeCallback);
    }
}
