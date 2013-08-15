// dino - Thu, 15 Aug 2013  11:28
// This is a pre-release snapshot of the 0.4.0 release.
//
// As far as I can tell, the diff to the released 0.4.0 is that this
// snap lacks the timepicker widget, and pagination is done differently.
//
// This one is then patched to include:
// - popover-template (popout with an arrow/caret) which is not in 0.4.0
// - tooltip remove at 1667 (here) or 1865.
//

angular.module("ui.bootstrap", ["ui.bootstrap.tpls", "ui.bootstrap.transition","ui.bootstrap.collapse","ui.bootstrap.accordion","ui.bootstrap.alert","ui.bootstrap.buttons","ui.bootstrap.carousel","ui.bootstrap.datepicker","ui.bootstrap.dialog","ui.bootstrap.dropdownToggle","ui.bootstrap.modal","ui.bootstrap.pagination","ui.bootstrap.position","ui.bootstrap.tooltip","ui.bootstrap.popover","ui.bootstrap.progressbar","ui.bootstrap.rating","ui.bootstrap.tabs","ui.bootstrap.typeahead"]);
angular.module("ui.bootstrap.tpls", ["template/accordion/accordion-group.html","template/accordion/accordion.html","template/alert/alert.html","template/carousel/carousel.html","template/carousel/slide.html","template/datepicker/datepicker.html","template/dialog/message.html","template/pagination/pagination.html","template/tooltip/tooltip-html-unsafe-popup.html","template/tooltip/tooltip-popup.html","template/popover/popover.html","template/popover/popover-template.html","template/progressbar/bar.html","template/progressbar/progress.html","template/rating/rating.html","template/tabs/tab.html","template/tabs/tabset.html","template/typeahead/typeahead.html"]);
angular.module('ui.bootstrap.transition', [])

/**
 * $transition service provides a consistent interface to trigger CSS 3 transitions and to be informed when they complete.
 * @param  {DOMElement} element  The DOMElement that will be animated.
 * @param  {string|object|function} trigger  The thing that will cause the transition to start:
 *   - As a string, it represents the css class to be added to the element.
 *   - As an object, it represents a hash of style attributes to be applied to the element.
 *   - As a function, it represents a function to be called that will cause the transition to occur.
 * @return {Promise}  A promise that is resolved when the transition finishes.
 */
  .factory('$transition', ['$q', '$timeout', '$rootScope', function($q, $timeout, $rootScope) {

    var $transition = function(element, trigger, options) {
      options = options || {};
      var deferred = $q.defer();
      var endEventName = $transition[options.animation ? "animationEndEventName" : "transitionEndEventName"];

      var transitionEndHandler = function(event) {
        $rootScope.$apply(function() {
          element.unbind(endEventName, transitionEndHandler);
          deferred.resolve(element);
        });
      };

      if (endEventName) {
        element.bind(endEventName, transitionEndHandler);
      }

      // Wrap in a timeout to allow the browser time to update the DOM before the transition is to occur
      $timeout(function() {
        if ( angular.isString(trigger) ) {
          element.addClass(trigger);
        } else if ( angular.isFunction(trigger) ) {
          trigger(element);
        } else if ( angular.isObject(trigger) ) {
          element.css(trigger);
        }
        //If browser does not support transitions, instantly resolve
        if ( !endEventName ) {
          deferred.resolve(element);
        }
      });

      // Add our custom cancel function to the promise that is returned
      // We can call this if we are about to run a new transition, which we know will prevent this transition from ending,
      // i.e. it will therefore never raise a transitionEnd event for that transition
      deferred.promise.cancel = function() {
        if ( endEventName ) {
          element.unbind(endEventName, transitionEndHandler);
        }
        deferred.reject('Transition cancelled');
      };

      return deferred.promise;
    };

    // Work out the name of the transitionEnd event
    var transElement = document.createElement('trans');
    var transitionEndEventNames = {
      'WebkitTransition': 'webkitTransitionEnd',
      'MozTransition': 'transitionend',
      'OTransition': 'oTransitionEnd',
      'transition': 'transitionend'
    };
    var animationEndEventNames = {
      'WebkitTransition': 'webkitAnimationEnd',
      'MozTransition': 'animationend',
      'OTransition': 'oAnimationEnd',
      'transition': 'animationend'
    };
    function findEndEventName(endEventNames) {
      for (var name in endEventNames){
        if (transElement.style[name] !== undefined) {
          return endEventNames[name];
        }
      }
    }
    $transition.transitionEndEventName = findEndEventName(transitionEndEventNames);
    $transition.animationEndEventName = findEndEventName(animationEndEventNames);
    return $transition;
  }]);

angular.module('ui.bootstrap.collapse',['ui.bootstrap.transition'])

// The collapsible directive indicates a block of html that will expand and collapse
  .directive('collapse', ['$transition', function($transition) {
    // CSS transitions don't work with height: auto, so we have to manually change the height to a
    // specific value and then once the animation completes, we can reset the height to auto.
    // Unfortunately if you do this while the CSS transitions are specified (i.e. in the CSS class
    // "collapse") then you trigger a change to height 0 in between.
    // The fix is to remove the "collapse" CSS class while changing the height back to auto - phew!
    var fixUpHeight = function(scope, element, height) {
      // We remove the collapse CSS class to prevent a transition when we change to height: auto
      element.removeClass('collapse');
      element.css({ height: height });
      // It appears that  reading offsetWidth makes the browser realise that we have changed the
      // height already :-/
      var x = element[0].offsetWidth;
      element.addClass('collapse');
    };

    return {
      link: function(scope, element, attrs) {

        var isCollapsed;
        var initialAnimSkip = true;
        scope.$watch(function (){ return element[0].scrollHeight; }, function (value) {
          //The listener is called when scollHeight changes
          //It actually does on 2 scenarios:
          // 1. Parent is set to display none
          // 2. angular bindings inside are resolved
          //When we have a change of scrollHeight we are setting again the correct height if the group is opened
          if (element[0].scrollHeight !== 0) {
            if (!isCollapsed) {
              if (initialAnimSkip) {
                fixUpHeight(scope, element, element[0].scrollHeight + 'px');
              } else {
                fixUpHeight(scope, element, 'auto');
              }
            }
          }
        });

        scope.$watch(attrs.collapse, function(value) {
          if (value) {
            collapse();
          } else {
            expand();
          }
        });


        var currentTransition;
        var doTransition = function(change) {
          if ( currentTransition ) {
            currentTransition.cancel();
          }
          currentTransition = $transition(element,change);
          currentTransition.then(
            function() { currentTransition = undefined; },
            function() { currentTransition = undefined; }
          );
          return currentTransition;
        };

        var expand = function() {
          if (initialAnimSkip) {
            initialAnimSkip = false;
            if ( !isCollapsed ) {
              fixUpHeight(scope, element, 'auto');
            }
          } else {
            doTransition({ height : element[0].scrollHeight + 'px' })
              .then(function() {
                // This check ensures that we don't accidentally update the height if the user has closed
                // the group while the animation was still running
                if ( !isCollapsed ) {
                  fixUpHeight(scope, element, 'auto');
                }
              });
          }
          isCollapsed = false;
        };

        var collapse = function() {
          isCollapsed = true;
          if (initialAnimSkip) {
            initialAnimSkip = false;
            fixUpHeight(scope, element, 0);
          } else {
            fixUpHeight(scope, element, element[0].scrollHeight + 'px');
            doTransition({'height':'0'});
          }
        };
      }
    };
  }]);

angular.module('ui.bootstrap.accordion', ['ui.bootstrap.collapse'])

  .constant('accordionConfig', {
    closeOthers: true
  })

  .controller('AccordionController', ['$scope', '$attrs', 'accordionConfig', function ($scope, $attrs, accordionConfig) {

    // This array keeps track of the accordion groups
    this.groups = [];

    // Ensure that all the groups in this accordion are closed, unless close-others explicitly says not to
    this.closeOthers = function(openGroup) {
      var closeOthers = angular.isDefined($attrs.closeOthers) ? $scope.$eval($attrs.closeOthers) : accordionConfig.closeOthers;
      if ( closeOthers ) {
        angular.forEach(this.groups, function (group) {
          if ( group !== openGroup ) {
            group.isOpen = false;
          }
        });
      }
    };

    // This is called from the accordion-group directive to add itself to the accordion
    this.addGroup = function(groupScope) {
      var that = this;
      this.groups.push(groupScope);

      groupScope.$on('$destroy', function (event) {
        that.removeGroup(groupScope);
      });
    };

    // This is called from the accordion-group directive when to remove itself
    this.removeGroup = function(group) {
      var index = this.groups.indexOf(group);
      if ( index !== -1 ) {
        this.groups.splice(this.groups.indexOf(group), 1);
      }
    };

  }])

// The accordion directive simply sets up the directive controller
// and adds an accordion CSS class to itself element.
  .directive('accordion', function () {
    return {
      restrict:'EA',
      controller:'AccordionController',
      transclude: true,
      replace: false,
      templateUrl: 'template/accordion/accordion.html'
    };
  })

// The accordion-group directive indicates a block of html that will expand and collapse in an accordion
  .directive('accordionGroup', ['$parse', '$transition', '$timeout', function($parse, $transition, $timeout) {
    return {
      require:'^accordion',         // We need this directive to be inside an accordion
      restrict:'EA',
      transclude:true,              // It transcludes the contents of the directive into the template
      replace: true,                // The element containing the directive will be replaced with the template
      templateUrl:'template/accordion/accordion-group.html',
      scope:{ heading:'@' },        // Create an isolated scope and interpolate the heading attribute onto this scope
      controller: ['$scope', function($scope) {
        this.setHeading = function(element) {
          this.heading = element;
        };
      }],
      link: function(scope, element, attrs, accordionCtrl) {
        var getIsOpen, setIsOpen;

        accordionCtrl.addGroup(scope);

        scope.isOpen = false;

        if ( attrs.isOpen ) {
          getIsOpen = $parse(attrs.isOpen);
          setIsOpen = getIsOpen.assign;

          scope.$watch(
            function watchIsOpen() { return getIsOpen(scope.$parent); },
            function updateOpen(value) { scope.isOpen = value; }
          );

          scope.isOpen = getIsOpen ? getIsOpen(scope.$parent) : false;
        }

        scope.$watch('isOpen', function(value) {
          if ( value ) {
            accordionCtrl.closeOthers(scope);
          }
          if ( setIsOpen ) {
            setIsOpen(scope.$parent, value);
          }
        });
      }
    };
  }])

// Use accordion-heading below an accordion-group to provide a heading containing HTML
// <accordion-group>
//   <accordion-heading>Heading containing HTML - <img src="..."></accordion-heading>
// </accordion-group>
  .directive('accordionHeading', function() {
    return {
      restrict: 'E',
      transclude: true,   // Grab the contents to be used as the heading
      template: '',       // In effect remove this element!
      replace: true,
      require: '^accordionGroup',
      compile: function(element, attr, transclude) {
        return function link(scope, element, attr, accordionGroupCtrl) {
          // Pass the heading to the accordion-group controller
          // so that it can be transcluded into the right place in the template
          // [The second parameter to transclude causes the elements to be cloned so that they work in ng-repeat]
          accordionGroupCtrl.setHeading(transclude(scope, function() {}));
        };
      }
    };
  })

// Use in the accordion-group template to indicate where you want the heading to be transcluded
// You must provide the property on the accordion-group controller that will hold the transcluded element
// <div class="accordion-group">
//   <div class="accordion-heading" ><a ... accordion-transclude="heading">...</a></div>
//   ...
// </div>
  .directive('accordionTransclude', function() {
    return {
      require: '^accordionGroup',
      link: function(scope, element, attr, controller) {
        scope.$watch(function() { return controller[attr.accordionTransclude]; }, function(heading) {
          if ( heading ) {
            element.html('');
            element.append(heading);
          }
        });
      }
    };
  });

angular.module("ui.bootstrap.alert", []).directive('alert', function () {
  return {
    restrict:'EA',
    templateUrl:'template/alert/alert.html',
    transclude:true,
    replace:true,
    scope: {
      type: '=',
      close: '&'
    },
    link: function(scope, iElement, iAttrs, controller) {
      scope.closeable = "close" in iAttrs;
    }
  };
});

angular.module('ui.bootstrap.buttons', [])

  .constant('buttonConfig', {
    activeClass:'active',
    toggleEvent:'click'
  })

  .directive('btnRadio', ['buttonConfig', function (buttonConfig) {
    var activeClass = buttonConfig.activeClass || 'active';
    var toggleEvent = buttonConfig.toggleEvent || 'click';

    return {

      require:'ngModel',
      link:function (scope, element, attrs, ngModelCtrl) {

        var value = scope.$eval(attrs.btnRadio);

        //model -> UI
        scope.$watch(function () {
          return ngModelCtrl.$modelValue;
        }, function (modelValue) {
          if (angular.equals(modelValue, value)){
            element.addClass(activeClass);
          } else {
            element.removeClass(activeClass);
          }
        });

        //ui->model
        element.bind(toggleEvent, function () {
          if (!element.hasClass(activeClass)) {
            scope.$apply(function () {
              ngModelCtrl.$setViewValue(value);
            });
          }
        });
      }
    };
  }])

  .directive('btnCheckbox', ['buttonConfig', function (buttonConfig) {

    var activeClass = buttonConfig.activeClass || 'active';
    var toggleEvent = buttonConfig.toggleEvent || 'click';

    return {
      require:'ngModel',
      link:function (scope, element, attrs, ngModelCtrl) {

        var trueValue = scope.$eval(attrs.btnCheckboxTrue);
        var falseValue = scope.$eval(attrs.btnCheckboxFalse);

        trueValue = angular.isDefined(trueValue) ? trueValue : true;
        falseValue = angular.isDefined(falseValue) ? falseValue : false;

        //model -> UI
        scope.$watch(function () {
          return ngModelCtrl.$modelValue;
        }, function (modelValue) {
          if (angular.equals(modelValue, trueValue)) {
            element.addClass(activeClass);
          } else {
            element.removeClass(activeClass);
          }
        });

        //ui->model
        element.bind(toggleEvent, function () {
          scope.$apply(function () {
            ngModelCtrl.$setViewValue(element.hasClass(activeClass) ? falseValue : trueValue);
          });
        });
      }
    };
  }]);
/*
 *
 *    AngularJS Bootstrap Carousel
 *
 *      A pure AngularJS carousel.
 *
 *      For no interval set the interval to non-number, or milliseconds of desired interval
 *      Template: <carousel interval="none"><slide>{{anything}}</slide></carousel>
 *      To change the carousel's active slide set the active attribute to true
 *      Template: <carousel interval="none"><slide active="someModel">{{anything}}</slide></carousel>
 */
angular.module('ui.bootstrap.carousel', ['ui.bootstrap.transition'])
  .controller('CarouselController', ['$scope', '$timeout', '$transition', '$q', function ($scope, $timeout, $transition, $q) {
    var self = this,
        slides = self.slides = [],
        currentIndex = -1,
        currentTimeout, isPlaying;
    self.currentSlide = null;

    /* direction: "prev" or "next" */
    self.select = function(nextSlide, direction) {
      var nextIndex = slides.indexOf(nextSlide);
      //Decide direction if it's not given
      if (direction === undefined) {
        direction = nextIndex > currentIndex ? "next" : "prev";
      }
      if (nextSlide && nextSlide !== self.currentSlide) {
        if ($scope.$currentTransition) {
          $scope.$currentTransition.cancel();
          //Timeout so ng-class in template has time to fix classes for finished slide
          $timeout(goNext);
        } else {
          goNext();
        }
      }
      function goNext() {
        //If we have a slide to transition from and we have a transition type and we're allowed, go
        if (self.currentSlide && angular.isString(direction) && !$scope.noTransition && nextSlide.$element) {
          //We shouldn't do class manip in here, but it's the same weird thing bootstrap does. need to fix sometime
          nextSlide.$element.addClass(direction);
          nextSlide.$element[0].offsetWidth = nextSlide.$element[0].offsetWidth; //force reflow

          //Set all other slides to stop doing their stuff for the new transition
          angular.forEach(slides, function(slide) {
            angular.extend(slide, {direction: '', entering: false, leaving: false, active: false});
          });
          angular.extend(nextSlide, {direction: direction, active: true, entering: true});
          angular.extend(self.currentSlide||{}, {direction: direction, leaving: true});

          $scope.$currentTransition = $transition(nextSlide.$element, {});
          //We have to create new pointers inside a closure since next & current will change
          (function(next,current) {
            $scope.$currentTransition.then(
              function(){ transitionDone(next, current); },
              function(){ transitionDone(next, current); }
            );
          }(nextSlide, self.currentSlide));
        } else {
          transitionDone(nextSlide, self.currentSlide);
        }
        self.currentSlide = nextSlide;
        currentIndex = nextIndex;
        //every time you change slides, reset the timer
        restartTimer();
      }
      function transitionDone(next, current) {
        angular.extend(next, {direction: '', active: true, leaving: false, entering: false});
        angular.extend(current||{}, {direction: '', active: false, leaving: false, entering: false});
        $scope.$currentTransition = null;
      }
    };

    /* Allow outside people to call indexOf on slides array */
    self.indexOfSlide = function(slide) {
      return slides.indexOf(slide);
    };

    $scope.next = function() {
      var newIndex = (currentIndex + 1) % slides.length;

      //Prevent this user-triggered transition from occurring if there is already one in progress
      if (!$scope.$currentTransition) {
        return self.select(slides[newIndex], 'next');
      }
    };

    $scope.prev = function() {
      var newIndex = currentIndex - 1 < 0 ? slides.length - 1 : currentIndex - 1;

      //Prevent this user-triggered transition from occurring if there is already one in progress
      if (!$scope.$currentTransition) {
        return self.select(slides[newIndex], 'prev');
      }
    };

    $scope.select = function(slide) {
      self.select(slide);
    };

    $scope.isActive = function(slide) {
      return self.currentSlide === slide;
    };

    $scope.slides = function() {
      return slides;
    };

    $scope.$watch('interval', restartTimer);
    function restartTimer() {
      if (currentTimeout) {
        $timeout.cancel(currentTimeout);
      }
      function go() {
        if (isPlaying) {
          $scope.next();
          restartTimer();
        } else {
          $scope.pause();
        }
      }
      var interval = +$scope.interval;
      if (!isNaN(interval) && interval>=0) {
        currentTimeout = $timeout(go, interval);
      }
    }
    $scope.play = function() {
      if (!isPlaying) {
        isPlaying = true;
        restartTimer();
      }
    };
    $scope.pause = function() {
      isPlaying = false;
      if (currentTimeout) {
        $timeout.cancel(currentTimeout);
      }
    };

    self.addSlide = function(slide, element) {
      slide.$element = element;
      slides.push(slide);
      //if this is the first slide or the slide is set to active, select it
      if(slides.length === 1 || slide.active) {
        self.select(slides[slides.length-1]);
        if (slides.length == 1) {
          $scope.play();
        }
      } else {
        slide.active = false;
      }
    };

    self.removeSlide = function(slide) {
      //get the index of the slide inside the carousel
      var index = slides.indexOf(slide);
      slides.splice(index, 1);
      if (slides.length > 0 && slide.active) {
        if (index >= slides.length) {
          self.select(slides[index-1]);
        } else {
          self.select(slides[index]);
        }
      }
    };
  }])
  .directive('carousel', [function() {
    return {
      restrict: 'EA',
      transclude: true,
      replace: true,
      controller: 'CarouselController',
      require: 'carousel',
      templateUrl: 'template/carousel/carousel.html',
      scope: {
        interval: '=',
        noTransition: '='
      }
    };
  }])
  .directive('slide', [function() {
    return {
      require: '^carousel',
      restrict: 'EA',
      transclude: true,
      replace: true,
      templateUrl: 'template/carousel/slide.html',
      scope: {
        active: '='
      },
      link: function (scope, element, attrs, carouselCtrl) {
        carouselCtrl.addSlide(scope, element);
        //when the scope is destroyed then remove the slide from the current slides array
        scope.$on('$destroy', function() {
          carouselCtrl.removeSlide(scope);
        });

        scope.$watch('active', function(active) {
          if (active) {
            carouselCtrl.select(scope);
          }
        });
      }
    };
  }]);

angular.module('ui.bootstrap.datepicker', [])

  .constant('datepickerConfig', {
    dayFormat: 'dd',
    monthFormat: 'MMMM',
    yearFormat: 'yyyy',
    dayHeaderFormat: 'EEE',
    dayTitleFormat: 'MMMM yyyy',
    monthTitleFormat: 'yyyy',
    showWeeks: true,
    startingDay: 0,
    yearRange: 20
  })

  .directive( 'datepicker', ['dateFilter', '$parse', 'datepickerConfig', function (dateFilter, $parse, datepickerConfig) {
    return {
      restrict: 'EA',
      replace: true,
      scope: {
        model: '=ngModel',
        dateDisabled: '&'
      },
      templateUrl: 'template/datepicker/datepicker.html',
      link: function(scope, element, attrs) {
        scope.mode = 'day'; // Initial mode

        // Configuration parameters
        var selected = new Date(), showWeeks, minDate, maxDate, format = {};
        format.day   = angular.isDefined(attrs.dayFormat) ? scope.$eval(attrs.dayFormat) : datepickerConfig.dayFormat;
        format.month = angular.isDefined(attrs.monthFormat) ? scope.$eval(attrs.monthFormat) : datepickerConfig.monthFormat;
        format.year  = angular.isDefined(attrs.yearFormat) ? scope.$eval(attrs.yearFormat) : datepickerConfig.yearFormat;
        format.dayHeader  = angular.isDefined(attrs.dayHeaderFormat) ? scope.$eval(attrs.dayHeaderFormat) : datepickerConfig.dayHeaderFormat;
        format.dayTitle   = angular.isDefined(attrs.dayTitleFormat) ? scope.$eval(attrs.dayTitleFormat) : datepickerConfig.dayTitleFormat;
        format.monthTitle = angular.isDefined(attrs.monthTitleFormat) ? scope.$eval(attrs.monthTitleFormat) : datepickerConfig.monthTitleFormat;
        var startingDay   = angular.isDefined(attrs.startingDay) ? scope.$eval(attrs.startingDay) : datepickerConfig.startingDay;
        var yearRange = angular.isDefined(attrs.yearRange) ? scope.$eval(attrs.yearRange) : datepickerConfig.yearRange;

        if (attrs.showWeeks) {
          scope.$parent.$watch($parse(attrs.showWeeks), function(value) {
            showWeeks = !! value;
            updateShowWeekNumbers();
          });
        } else {
          showWeeks = datepickerConfig.showWeeks;
          updateShowWeekNumbers();
        }

        if (attrs.min) {
          scope.$parent.$watch($parse(attrs.min), function(value) {
            minDate = new Date(value);
            refill();
          });
        }
        if (attrs.max) {
          scope.$parent.$watch($parse(attrs.max), function(value) {
            maxDate = new Date(value);
            refill();
          });
        }

        function updateCalendar (rows, labels, title) {
          scope.rows = rows;
          scope.labels = labels;
          scope.title = title;
        }

        // Define whether the week number are visible
        function updateShowWeekNumbers() {
          scope.showWeekNumbers = ( scope.mode === 'day' && showWeeks );
        }

        function compare( date1, date2 ) {
          if ( scope.mode === 'year') {
            return date2.getFullYear() - date1.getFullYear();
          } else if ( scope.mode === 'month' ) {
            return new Date( date2.getFullYear(), date2.getMonth() ) - new Date( date1.getFullYear(), date1.getMonth() );
          } else if ( scope.mode === 'day' ) {
            return (new Date( date2.getFullYear(), date2.getMonth(), date2.getDate() ) - new Date( date1.getFullYear(), date1.getMonth(), date1.getDate() ) );
          }
        }

        function isDisabled(date) {
          return ((minDate && compare(date, minDate) > 0) || (maxDate && compare(date, maxDate) < 0) || (scope.dateDisabled && scope.dateDisabled({ date: date, mode: scope.mode })));
        }

        // Split array into smaller arrays
        var split = function(a, size) {
          var arrays = [];
          while (a.length > 0) {
            arrays.push(a.splice(0, size));
          }
          return arrays;
        };
        var getDaysInMonth = function( year, month ) {
          return new Date(year, month + 1, 0).getDate();
        };

        var fill = {
          day: function() {
            var days = [], labels = [], lastDate = null;

            function addDays( dt, n, isCurrentMonth ) {
              for (var i =0; i < n; i ++) {
                days.push( {date: new Date(dt), isCurrent: isCurrentMonth, isSelected: isSelected(dt), label: dateFilter(dt, format.day), disabled: isDisabled(dt) } );
                dt.setDate( dt.getDate() + 1 );
              }
              lastDate = dt;
            }

            var d = new Date(selected);
            d.setDate(1);

            var difference = startingDay - d.getDay();
            var numDisplayedFromPreviousMonth = (difference > 0) ? 7 - difference : - difference;

            if ( numDisplayedFromPreviousMonth > 0 ) {
              d.setDate( - numDisplayedFromPreviousMonth + 1 );
              addDays(d, numDisplayedFromPreviousMonth, false);
            }
            addDays(lastDate || d, getDaysInMonth(selected.getFullYear(), selected.getMonth()), true);
            addDays(lastDate, (7 - days.length % 7) % 7, false);

            // Day labels
            for (i = 0; i < 7; i++) {
              labels.push(  dateFilter(days[i].date, format.dayHeader) );
            }
            updateCalendar( split( days, 7 ), labels, dateFilter(selected, format.dayTitle) );
          },
          month: function() {
            var months = [], i = 0, year = selected.getFullYear();
            while ( i < 12 ) {
              var dt = new Date(year, i++, 1);
              months.push( {date: dt, isCurrent: true, isSelected: isSelected(dt), label: dateFilter(dt, format.month), disabled: isDisabled(dt)} );
            }
            updateCalendar( split( months, 3 ), [], dateFilter(selected, format.monthTitle) );
          },
          year: function() {
            var years = [], year = parseInt((selected.getFullYear() - 1) / yearRange, 10) * yearRange + 1;
            for ( var i = 0; i < yearRange; i++ ) {
              var dt = new Date(year + i, 0, 1);
              years.push( {date: dt, isCurrent: true, isSelected: isSelected(dt), label: dateFilter(dt, format.year), disabled: isDisabled(dt)} );
            }
            var title = years[0].label + ' - ' + years[years.length - 1].label;
            updateCalendar( split( years, 5 ), [], title );
          }
        };
        var refill = function() {
          fill[scope.mode]();
        };
        var isSelected = function( dt ) {
          if ( scope.model && scope.model.getFullYear() === dt.getFullYear() ) {
            if ( scope.mode === 'year' ) {
              return true;
            }
            if ( scope.model.getMonth() === dt.getMonth() ) {
              return ( scope.mode === 'month' || (scope.mode === 'day' && scope.model.getDate() === dt.getDate()) );
            }
          }
          return false;
        };

        scope.$watch('model', function ( dt, olddt ) {
          if ( angular.isDate(dt) ) {
            selected = angular.copy(dt);
          }

          if ( ! angular.equals(dt, olddt) ) {
            refill();
          }
        });
        scope.$watch('mode', function() {
          updateShowWeekNumbers();
          refill();
        });

        scope.select = function( dt ) {
          selected = new Date(dt);

          if ( scope.mode === 'year' ) {
            scope.mode = 'month';
            selected.setFullYear( dt.getFullYear() );
          } else if ( scope.mode === 'month' ) {
            scope.mode = 'day';
            selected.setMonth( dt.getMonth() );
          } else if ( scope.mode === 'day' ) {
            scope.model = new Date(selected);
          }
        };
        scope.move = function(step) {
          if (scope.mode === 'day') {
            selected.setMonth( selected.getMonth() + step );
          } else if (scope.mode === 'month') {
            selected.setFullYear( selected.getFullYear() + step );
          } else if (scope.mode === 'year') {
            selected.setFullYear( selected.getFullYear() + step * yearRange );
          }
          refill();
        };
        scope.toggleMode = function() {
          scope.mode = ( scope.mode === 'day' ) ? 'month' : ( scope.mode === 'month' ) ? 'year' : 'day';
        };
        scope.getWeekNumber = function(row) {
          if ( scope.mode !== 'day' || ! scope.showWeekNumbers || row.length !== 7 ) {
            return;
          }

          var index = ( startingDay > 4 ) ? 11 - startingDay : 4 - startingDay; // Thursday
          var d = new Date( row[ index ].date );
          d.setHours(0, 0, 0);
          return Math.ceil((((d - new Date(d.getFullYear(), 0, 1)) / 86400000) + 1) / 7); // 86400000 = 1000*60*60*24;
        };
      }
    };
  }]);
// The `$dialogProvider` can be used to configure global defaults for your
// `$dialog` service.
var dialogModule = angular.module('ui.bootstrap.dialog', ['ui.bootstrap.transition']);

dialogModule.controller('MessageBoxController', ['$scope', 'dialog', 'model', function($scope, dialog, model){
  $scope.title = model.title;
  $scope.message = model.message;
  $scope.buttons = model.buttons;
  $scope.close = function(res){
    dialog.close(res);
  };
}]);

dialogModule.provider("$dialog", function(){

  // The default options for all dialogs.
  var defaults = {
    backdrop: true,
    dialogClass: 'modal',
    backdropClass: 'modal-backdrop',
    transitionClass: 'fade',
    triggerClass: 'in',
    resolve:{},
    backdropFade: false,
    dialogFade:false,
    keyboard: true, // close with esc key
    backdropClick: true // only in conjunction with backdrop=true
    /* other options: template, templateUrl, controller */
  };

  var globalOptions = {};

  var activeBackdrops = {value : 0};

  // The `options({})` allows global configuration of all dialogs in the application.
  //
  //      var app = angular.module('App', ['ui.bootstrap.dialog'], function($dialogProvider){
  //        // don't close dialog when backdrop is clicked by default
  //        $dialogProvider.options({backdropClick: false});
  //      });
  this.options = function(value){
    globalOptions = value;
  };

  // Returns the actual `$dialog` service that is injected in controllers
  this.$get = ["$http", "$document", "$compile", "$rootScope", "$controller", "$templateCache", "$q", "$transition", "$injector",
               function ($http, $document, $compile, $rootScope, $controller, $templateCache, $q, $transition, $injector) {

                 var body = $document.find('body');

                 function createElement(clazz) {
                   var el = angular.element("<div>");
                   el.addClass(clazz);
                   return el;
                 }

                 // The `Dialog` class represents a modal dialog. The dialog class can be invoked by providing an options object
                 // containing at lest template or templateUrl and controller:
                 //
                 //     var d = new Dialog({templateUrl: 'foo.html', controller: 'BarController'});
                 //
                 // Dialogs can also be created using templateUrl and controller as distinct arguments:
                 //
                 //     var d = new Dialog('path/to/dialog.html', MyDialogController);
                 function Dialog(opts) {

                   var self = this, options = this.options = angular.extend({}, defaults, globalOptions, opts);
                   this._open = false;

                   this.backdropEl = createElement(options.backdropClass);
                   if(options.backdropFade){
                     this.backdropEl.addClass(options.transitionClass);
                     this.backdropEl.removeClass(options.triggerClass);
                   }

                   this.modalEl = createElement(options.dialogClass);
                   if(options.dialogFade){
                     this.modalEl.addClass(options.transitionClass);
                     this.modalEl.removeClass(options.triggerClass);
                   }

                   this.handledEscapeKey = function(e) {
                     if (e.which === 27) {
                       self.close();
                       e.preventDefault();
                       self.$scope.$apply();
                     }
                   };

                   this.handleBackDropClick = function(e) {
                     self.close();
                     e.preventDefault();
                     self.$scope.$apply();
                   };

                   this.handleLocationChange = function() {
                     self.close();
                   };
                 }

                 // The `isOpen()` method returns wether the dialog is currently visible.
                 Dialog.prototype.isOpen = function(){
                   return this._open;
                 };

                 // The `open(templateUrl, controller)` method opens the dialog.
                 // Use the `templateUrl` and `controller` arguments if specifying them at dialog creation time is not desired.
                 Dialog.prototype.open = function(templateUrl, controller){
                   var self = this, options = this.options;

                   if(templateUrl){
                     options.templateUrl = templateUrl;
                   }
                   if(controller){
                     options.controller = controller;
                   }

                   if(!(options.template || options.templateUrl)) {
                     throw new Error('Dialog.open expected template or templateUrl, neither found. Use options or open method to specify them.');
                   }

                   this._loadResolves().then(function(locals) {
                     var $scope = locals.$scope = self.$scope = locals.$scope ? locals.$scope : $rootScope.$new();

                     self.modalEl.html(locals.$template);

                     if (self.options.controller) {
                       var ctrl = $controller(self.options.controller, locals);
                       self.modalEl.children().data('ngControllerController', ctrl);
                     }

                     $compile(self.modalEl)($scope);
                     self._addElementsToDom();

                     // trigger tranisitions
                     setTimeout(function(){
                       if(self.options.dialogFade){ self.modalEl.addClass(self.options.triggerClass); }
                       if(self.options.backdropFade){ self.backdropEl.addClass(self.options.triggerClass); }
                     });

                     self._bindEvents();
                   });

                   this.deferred = $q.defer();
                   return this.deferred.promise;
                 };

                 // closes the dialog and resolves the promise returned by the `open` method with the specified result.
                 Dialog.prototype.close = function(result){
                   var self = this;
                   var fadingElements = this._getFadingElements();

                   if(fadingElements.length > 0){
                     for (var i = fadingElements.length - 1; i >= 0; i--) {
                       $transition(fadingElements[i], removeTriggerClass).then(onCloseComplete);
                     }
                     return;
                   }

                   this._onCloseComplete(result);

                   function removeTriggerClass(el){
                     el.removeClass(self.options.triggerClass);
                   }

                   function onCloseComplete(){
                     if(self._open){
                       self._onCloseComplete(result);
                     }
                   }
                 };

                 Dialog.prototype._getFadingElements = function(){
                   var elements = [];
                   if(this.options.dialogFade){
                     elements.push(this.modalEl);
                   }
                   if(this.options.backdropFade){
                     elements.push(this.backdropEl);
                   }

                   return elements;
                 };

                 Dialog.prototype._bindEvents = function() {
                   if(this.options.keyboard){ body.bind('keydown', this.handledEscapeKey); }
                   if(this.options.backdrop && this.options.backdropClick){ this.backdropEl.bind('click', this.handleBackDropClick); }

                   this.$scope.$on('$locationChangeSuccess', this.handleLocationChange);
                 };

                 Dialog.prototype._unbindEvents = function() {
                   if(this.options.keyboard){ body.unbind('keydown', this.handledEscapeKey); }
                   if(this.options.backdrop && this.options.backdropClick){ this.backdropEl.unbind('click', this.handleBackDropClick); }
                 };

                 Dialog.prototype._onCloseComplete = function(result) {
                   this._removeElementsFromDom();
                   this._unbindEvents();

                   this.deferred.resolve(result);
                 };

                 Dialog.prototype._addElementsToDom = function(){
                   body.append(this.modalEl);

                   if(this.options.backdrop) {
                     if (activeBackdrops.value === 0) {
                       body.append(this.backdropEl);
                     }
                     activeBackdrops.value++;
                   }

                   this._open = true;
                 };

                 Dialog.prototype._removeElementsFromDom = function(){
                   this.modalEl.remove();

                   if(this.options.backdrop) {
                     activeBackdrops.value--;
                     if (activeBackdrops.value === 0) {
                       this.backdropEl.remove();
                     }
                   }
                   this._open = false;
                 };

                 // Loads all `options.resolve` members to be used as locals for the controller associated with the dialog.
                 Dialog.prototype._loadResolves = function(){
                   var values = [], keys = [], templatePromise, self = this;

                   if (this.options.template) {
                     templatePromise = $q.when(this.options.template);
                   } else if (this.options.templateUrl) {
                     templatePromise = $http.get(this.options.templateUrl, {cache:$templateCache})
                       .then(function(response) { return response.data; });
                   }

                   angular.forEach(this.options.resolve || [], function(value, key) {
                     keys.push(key);
                     values.push(angular.isString(value) ? $injector.get(value) : $injector.invoke(value));
                   });

                   keys.push('$template');
                   values.push(templatePromise);

                   return $q.all(values).then(function(values) {
                     var locals = {};
                     angular.forEach(values, function(value, index) {
                       locals[keys[index]] = value;
                     });
                     locals.dialog = self;
                     return locals;
                   });
                 };

                 // The actual `$dialog` service that is injected in controllers.
                 return {
                   // Creates a new `Dialog` with the specified options.
                   dialog: function(opts){
                     return new Dialog(opts);
                   },
                   // creates a new `Dialog` tied to the default message box template and controller.
                   //
                   // Arguments `title` and `message` are rendered in the modal header and body sections respectively.
                   // The `buttons` array holds an object with the following members for each button to include in the
                   // modal footer section:
                   //
                   // * `result`: the result to pass to the `close` method of the dialog when the button is clicked
                   // * `label`: the label of the button
                   // * `cssClass`: additional css class(es) to apply to the button for styling
                   messageBox: function(title, message, buttons){
                     return new Dialog({templateUrl: 'template/dialog/message.html', controller: 'MessageBoxController', resolve:
                                        {model: function() {
                                          return {
                                            title: title,
                                            message: message,
                                            buttons: buttons
                                          };
                                        }
                                        }});
                   }
                 };
               }];
});

/*
 * dropdownToggle - Provides dropdown menu functionality in place of bootstrap js
 * @restrict class or attribute
 * @example:
 <li class="dropdown">
 <a class="dropdown-toggle">My Dropdown Menu</a>
 <ul class="dropdown-menu">
 <li ng-repeat="choice in dropChoices">
 <a ng-href="{{choice.href}}">{{choice.text}}</a>
 </li>
 </ul>
 </li>
*/

angular.module('ui.bootstrap.dropdownToggle', [])
  .directive('dropdownToggle',
             ['$document', '$location', '$window', function ($document, $location, $window) {
               var openElement = null,
                   closeMenu   = angular.noop;
               return {
                 restrict: 'CA',
                 link: function(scope, element, attrs) {
                   scope.$watch('$location.path', function() { closeMenu(); });
                   element.parent().bind('click', function() { closeMenu(); });
                   element.bind('click', function(event) {
                     event.preventDefault();
                     event.stopPropagation();
                     var elementWasOpen = (element === openElement);
                     if (!!openElement) {
                       closeMenu(); }
                     if (!elementWasOpen){
                       element.parent().addClass('open');
                       openElement = element;
                       closeMenu = function (event) {
                         if (event) {
                           event.preventDefault();
                           event.stopPropagation();
                         }
                         $document.unbind('click', closeMenu);
                         element.parent().removeClass('open');
                         closeMenu   = angular.noop;
                         openElement = null;
                       };
                       $document.bind('click', closeMenu);
                     }
                   });
                 }
               };
             }]);
angular.module('ui.bootstrap.modal', ['ui.bootstrap.dialog'])
  .directive('modal', ['$parse', '$dialog', function($parse, $dialog) {
    return {
      restrict: 'EA',
      terminal: true,
      link: function(scope, elm, attrs) {
        var opts = angular.extend({}, scope.$eval(attrs.uiOptions || attrs.bsOptions || attrs.options));
        var shownExpr = attrs.modal || attrs.show;
        var setClosed;

        // Create a dialog with the template as the contents of the directive
        // Add the current scope as the resolve in order to make the directive scope as a dialog controller scope
        opts = angular.extend(opts, {
          template: elm.html(),
          resolve: { $scope: function() { return scope; } }
        });
        var dialog = $dialog.dialog(opts);

        elm.remove();

        if (attrs.close) {
          setClosed = function() {
            $parse(attrs.close)(scope);
          };
        } else {
          setClosed = function() {
            if (angular.isFunction($parse(shownExpr).assign)) {
              $parse(shownExpr).assign(scope, false);
            }
          };
        }

        scope.$watch(shownExpr, function(isShown, oldShown) {
          if (isShown) {
            dialog.open().then(function(){
              setClosed();
            });
          } else {
            //Make sure it is not opened
            if (dialog.isOpen()){
              dialog.close();
            }
          }
        });
      }
    };
  }]);
angular.module('ui.bootstrap.pagination', [])

  .constant('paginationConfig', {
    boundaryLinks: false,
    directionLinks: true,
    firstText: 'First',
    previousText: 'Previous',
    nextText: 'Next',
    lastText: 'Last',
    rotate: true
  })

  .directive('pagination', ['paginationConfig', function(paginationConfig) {
    return {
      restrict: 'EA',
      scope: {
        numPages: '=',
        currentPage: '=',
        maxSize: '=',
        onSelectPage: '&'
      },
      templateUrl: 'template/pagination/pagination.html',
      replace: true,
      link: function(scope, element, attrs) {

        // Setup configuration parameters
        var boundaryLinks = angular.isDefined(attrs.boundaryLinks) ? scope.$eval(attrs.boundaryLinks) : paginationConfig.boundaryLinks;
        var directionLinks = angular.isDefined(attrs.directionLinks) ? scope.$eval(attrs.directionLinks) : paginationConfig.directionLinks;
        var firstText = angular.isDefined(attrs.firstText) ? attrs.firstText : paginationConfig.firstText;
        var previousText = angular.isDefined(attrs.previousText) ? attrs.previousText : paginationConfig.previousText;
        var nextText = angular.isDefined(attrs.nextText) ? attrs.nextText : paginationConfig.nextText;
        var lastText = angular.isDefined(attrs.lastText) ? attrs.lastText : paginationConfig.lastText;
        var rotate = angular.isDefined(attrs.rotate) ? scope.$eval(attrs.rotate) : paginationConfig.rotate;

        // Create page object used in template
        function makePage(number, text, isActive, isDisabled) {
          return {
            number: number,
            text: text,
            active: isActive,
            disabled: isDisabled
          };
        }

        scope.$watch('numPages + currentPage + maxSize', function() {
          scope.pages = [];

          // Default page limits
          var startPage = 1, endPage = scope.numPages;
          var isMaxSized = ( angular.isDefined(scope.maxSize) && scope.maxSize < scope.numPages );

          // recompute if maxSize
          if ( isMaxSized ) {
            if ( rotate ) {
              // Current page is displayed in the middle of the visible ones
              startPage = Math.max(scope.currentPage - Math.floor(scope.maxSize/2), 1);
              endPage   = startPage + scope.maxSize - 1;

              // Adjust if limit is exceeded
              if (endPage > scope.numPages) {
                endPage   = scope.numPages;
                startPage = endPage - scope.maxSize + 1;
              }
            } else {
              // Visible pages are paginated with maxSize
              startPage = ((Math.ceil(scope.currentPage / scope.maxSize) - 1) * scope.maxSize) + 1;

              // Adjust last page if limit is exceeded
              endPage = Math.min(startPage + scope.maxSize - 1, scope.numPages);
            }
          }

          // Add page number links
          for (var number = startPage; number <= endPage; number++) {
            var page = makePage(number, number, scope.isActive(number), false);
            scope.pages.push(page);
          }

          // Add links to move between page sets
          if ( isMaxSized && ! rotate ) {
            if ( startPage > 1 ) {
              var previousPageSet = makePage(startPage - 1, '...', false, false);
              scope.pages.unshift(previousPageSet);
            }

            if ( endPage < scope.numPages ) {
              var nextPageSet = makePage(endPage + 1, '...', false, false);
              scope.pages.push(nextPageSet);
            }
          }

          // Add previous & next links
          if (directionLinks) {
            var previousPage = makePage(scope.currentPage - 1, previousText, false, scope.noPrevious());
            scope.pages.unshift(previousPage);

            var nextPage = makePage(scope.currentPage + 1, nextText, false, scope.noNext());
            scope.pages.push(nextPage);
          }

          // Add first & last links
          if (boundaryLinks) {
            var firstPage = makePage(1, firstText, false, scope.noPrevious());
            scope.pages.unshift(firstPage);

            var lastPage = makePage(scope.numPages, lastText, false, scope.noNext());
            scope.pages.push(lastPage);
          }

          if ( scope.currentPage > scope.numPages ) {
            scope.selectPage(scope.numPages);
          }
        });
        scope.noPrevious = function() {
          return scope.currentPage === 1;
        };
        scope.noNext = function() {
          return scope.currentPage === scope.numPages;
        };
        scope.isActive = function(page) {
          return scope.currentPage === page;
        };

        scope.selectPage = function(page) {
          if ( ! scope.isActive(page) && page > 0 && page <= scope.numPages) {
            scope.currentPage = page;
            scope.onSelectPage({ page: page });
          }
        };
      }
    };
  }]);

angular.module('ui.bootstrap.position', [])

/**
 * A set of utility methods that can be use to retrieve position of DOM elements.
 * It is meant to be used where we need to absolute-position DOM elements in
 * relation to other, existing elements (this is the case for tooltips, popovers,
 * typeahead suggestions etc.).
 */
  .factory('$position', ['$document', '$window', function ($document, $window) {

    function getStyle(el, cssprop) {
      if (el.currentStyle) { //IE
        return el.currentStyle[cssprop];
      } else if ($window.getComputedStyle) {
        return $window.getComputedStyle(el)[cssprop];
      }
      // finally try and get inline style
      return el.style[cssprop];
    }

    /**
     * Checks if a given element is statically positioned
     * @param element - raw DOM element
     */
    function isStaticPositioned(element) {
      return (getStyle(element, "position") || 'static' ) === 'static';
    }

    /**
     * returns the closest, non-statically positioned parentOffset of a given element
     * @param element
     */
    var parentOffsetEl = function (element) {
      var docDomEl = $document[0];
      var offsetParent = element.offsetParent || docDomEl;
      while (offsetParent && offsetParent !== docDomEl && isStaticPositioned(offsetParent) ) {
        offsetParent = offsetParent.offsetParent;
      }
      return offsetParent || docDomEl;
    };

    return {
      /**
       * Provides read-only equivalent of jQuery's position function:
       * http://api.jquery.com/position/
       */
      position: function (element) {
        var elBCR = this.offset(element);
        var offsetParentBCR = { top: 0, left: 0 };
        var offsetParentEl = parentOffsetEl(element[0]);
        if (offsetParentEl != $document[0]) {
          offsetParentBCR = this.offset(angular.element(offsetParentEl));
          offsetParentBCR.top += offsetParentEl.clientTop;
          offsetParentBCR.left += offsetParentEl.clientLeft;
        }

        return {
          width: element.prop('offsetWidth'),
          height: element.prop('offsetHeight'),
          top: elBCR.top - offsetParentBCR.top,
          left: elBCR.left - offsetParentBCR.left
        };
      },

      /**
       * Provides read-only equivalent of jQuery's offset function:
       * http://api.jquery.com/offset/
       */
      offset: function (element) {
        var boundingClientRect = element[0].getBoundingClientRect();
        return {
          width: element.prop('offsetWidth'),
          height: element.prop('offsetHeight'),
          top: boundingClientRect.top + ($window.pageYOffset || $document[0].body.scrollTop),
          left: boundingClientRect.left + ($window.pageXOffset || $document[0].body.scrollLeft)
        };
      }
    };
  }]);

/**
 * The following features are still outstanding: animation as a
 * function, placement as a function, inside, support for more triggers than
 * just mouse enter/leave, html tooltips, and selector delegation.
 */
angular.module( 'ui.bootstrap.tooltip', [ 'ui.bootstrap.position' ] )

/**
 * The $tooltip service creates tooltip- and popover-like directives as well as
 * houses global options for them.
 */
  .provider( '$tooltip', function () {
    // The default options tooltip and popover.
    var defaultOptions = {
      placement: 'top',
      animation: true,
      popupDelay: 0
    };

    // Default hide triggers for each show trigger
    var triggerMap = {
      'mouseenter': 'mouseleave',
      'click': 'click',
      'focus': 'blur'
    };

    // The options specified to the provider globally.
    var globalOptions = {};

    /**
     * `options({})` allows global configuration of all tooltips in the
     * application.
     *
     *   var app = angular.module( 'App', ['ui.bootstrap.tooltip'], function( $tooltipProvider ) {
     *     // place tooltips left instead of top by default
     *     $tooltipProvider.options( { placement: 'left' } );
     *   });
     */
    this.options = function( value ) {
      angular.extend( globalOptions, value );
    };

    /**
     * This is a helper function for translating camel-case to snake-case.
     */
    function snake_case(name){
      var regexp = /[A-Z]/g;
      var separator = '-';
      return name.replace(regexp, function(letter, pos) {
        return (pos ? separator : '') + letter.toLowerCase();
      });
    }

    /**
     * Returns the actual instance of the $tooltip service.
     * TODO support multiple triggers
     */
    this.$get = [ '$window', '$compile', '$timeout', '$parse', '$document', '$position', function ( $window, $compile, $timeout, $parse, $document, $position ) {
      return function $tooltip ( type, prefix, defaultTriggerShow ) {
        var options = angular.extend( {}, defaultOptions, globalOptions );

        /**
         * Returns an object of show and hide triggers.
         *
         * If a trigger is supplied,
         * it is used to show the tooltip; otherwise, it will use the `trigger`
         * option passed to the `$tooltipProvider.options` method; else it will
         * default to the trigger supplied to this directive factory.
         *
         * The hide trigger is based on the show trigger. If the `trigger` option
         * was passed to the `$tooltipProvider.options` method, it will use the
         * mapped trigger from `triggerMap` or the passed trigger if the map is
         * undefined; otherwise, it uses the `triggerMap` value of the show
         * trigger; else it will just use the show trigger.
         */
        function setTriggers ( trigger ) {
          var show, hide;

          show = trigger || options.trigger || defaultTriggerShow;
          if ( angular.isDefined ( options.trigger ) ) {
            hide = triggerMap[options.trigger] || show;
          } else {
            hide = triggerMap[show] || show;
          }

          return {
            show: show,
            hide: hide
          };
        }

        var directiveName = snake_case( type );
        var triggers = setTriggers( undefined );

        var template =
          '<'+ directiveName +'-popup '+
          'title="{{tt_title}}" '+
          'content="{{tt_content}}" '+
          'placement="{{tt_placement}}" '+
          'animation="tt_animation()" '+
          'is-open="tt_isOpen" '+
          'template="{{tt_template}}"'+
          '>'+
          '</'+ directiveName +'-popup>';

        return {
          restrict: 'EA',
          scope: true,
          link: function link ( scope, element, attrs ) {
            var tooltip = $compile( template )( scope );
            var transitionTimeout;
            var popupTimeout;
            var $body;

            // By default, the tooltip is not open.
            // TODO add ability to start tooltip opened
            scope.tt_isOpen = false;

            function toggleTooltipBind () {
              if ( ! scope.tt_isOpen ) {
                showTooltipBind();
              } else {
                hideTooltipBind();
              }
            }

            // Show the tooltip with delay if specified, otherwise show it immediately
            function showTooltipBind() {
              if ( scope.tt_popupDelay ) {
                popupTimeout = $timeout( show, scope.tt_popupDelay );
              } else {
                scope.$apply( show );
              }
            }

            function hideTooltipBind () {
              scope.$apply(function () {
                hide();
              });
            }

            // Show the tooltip popup element.
            function show() {
              var position,
                  ttWidth,
                  ttHeight,
                  ttPosition;

              // Don't show empty tooltips.
              if ( ! scope.tt_content ) {
                return;
              }

              // If there is a pending remove transition, we must cancel it, lest the
              // tooltip be mysteriously removed.
              if ( transitionTimeout ) {
                $timeout.cancel( transitionTimeout );
              }

              // Set the initial positioning.
              tooltip.css({ top: 0, left: 0, display: 'block' });

              // Now we add it to the DOM because need some info about it. But it's not
              // visible yet anyway.
              if ( options.appendToBody ) {
                $body = $body || $document.find( 'body' );
                $body.append( tooltip );
              } else {
                element.after( tooltip );
              }

              // Get the position of the directive element.
              position = options.appendToBody ? $position.offset( element ) : $position.position( element );

              // Get the height and width of the tooltip so we can center it.
              ttWidth = tooltip.prop( 'offsetWidth' );
              ttHeight = tooltip.prop( 'offsetHeight' );

              // Calculate the tooltip's top and left coordinates to center it with
              // this directive.
              switch ( scope.tt_placement ) {
                case 'right':
                ttPosition = {
                  top: (position.top + position.height / 2 - ttHeight / 2) + 'px',
                  left: (position.left + position.width) + 'px'
                };
                break;
              case 'bottom':
                ttPosition = {
                  top: (position.top + position.height) + 'px',
                  left: (position.left + position.width / 2 - ttWidth / 2) + 'px'
                };
                break;
              case 'left':
                ttPosition = {
                  top: (position.top + position.height / 2 - ttHeight / 2) + 'px',
                  left: (position.left - ttWidth) + 'px'
                };
                break;
              default:
                ttPosition = {
                  top: (position.top - ttHeight) + 'px',
                  left: (position.left + position.width / 2 - ttWidth / 2) + 'px'
                };
                break;
              }

              // Now set the calculated positioning.
              tooltip.css( ttPosition );

              // And show the tooltip.
              scope.tt_isOpen = true;
            }

            // Hide the tooltip popup element.
            function hide() {
              // First things first: we don't show it anymore.
              scope.tt_isOpen = false;

              //if tooltip is going to be shown after delay, we must cancel this
              $timeout.cancel( popupTimeout );

              // And now we remove it from the DOM. However, if we have animation, we
              // need to wait for it to expire beforehand.
              // FIXME: this is a placeholder for a port of the transitions library.
              if ( angular.isDefined( scope.tt_animation ) && scope.tt_animation() ) {
                transitionTimeout = $timeout( function () { tooltip.css('display', 'none'); }, 500 );
              } else {
                tooltip.css('display', 'none');
              }
            }

            /**
             * Observe the relevant attributes.
             */
            attrs.$observe( type, function ( val ) {
              scope.tt_content = val;
            });

            attrs.$observe( prefix+'Title', function ( val ) {
              scope.tt_title = val;
            });

            attrs.$observe( prefix+'Placement', function ( val ) {
              scope.tt_placement = angular.isDefined( val ) ? val : options.placement;
            });

            attrs.$observe( prefix+'Animation', function ( val ) {
              scope.tt_animation = angular.isDefined( val ) ? $parse( val ) : function(){ return options.animation; };
            });

            attrs.$observe( prefix+'PopupDelay', function ( val ) {
              var delay = parseInt( val, 10 );
              scope.tt_popupDelay = ! isNaN(delay) ? delay : options.popupDelay;
            });

            attrs.$observe( prefix+'Trigger', function ( val ) {
              element.unbind( triggers.show );
              element.unbind( triggers.hide );

              triggers = setTriggers( val );

              if ( triggers.show === triggers.hide ) {
                element.bind( triggers.show, toggleTooltipBind );
              } else {
                element.bind( triggers.show, showTooltipBind );
                element.bind( triggers.hide, hideTooltipBind );
              }
            });

            attrs.$observe( prefix+'Template', function ( val ) {
              scope.tt_template = val;
            });

            // if a tooltip is attached to <body> we need to remove it on
            // location change as its parent scope will probably not be destroyed
            // by the change.
            if ( options.appendToBody ) {
              scope.$on('$locationChangeSuccess', function closeTooltipOnLocationChangeSuccess () {
                if ( scope.tt_isOpen ) {
                  hide();
                }
              });
            }

            // if this trigger element is destroyed while the tooltip is open, we
            // need to close the tooltip.
            scope.$on('$destroy', function closeTooltipOnDestroy () {
              if ( scope.tt_isOpen ) {
                hide();
              }
            });
          }
        };
      };
    }];
  })

  .directive( 'tooltipPopup', function () {
    return {
      restrict: 'E',
      replace: true,
      scope: { content: '@', placement: '@', animation: '&', isOpen: '&' },
      templateUrl: 'template/tooltip/tooltip-popup.html'
    };
  })

  .directive( 'tooltip', [ '$tooltip', function ( $tooltip ) {
    return $tooltip( 'tooltip', 'tooltip', 'mouseenter' );
  }])

  .directive( 'tooltipHtmlUnsafePopup', function () {
    return {
      restrict: 'E',
      replace: true,
      scope: { content: '@', placement: '@', animation: '&', isOpen: '&' },
      templateUrl: 'template/tooltip/tooltip-html-unsafe-popup.html'
    };
  })

  .directive( 'tooltipHtmlUnsafe', [ '$tooltip', function ( $tooltip ) {
    return $tooltip( 'tooltipHtmlUnsafe', 'tooltip', 'mouseenter' );
  }])

  .directive( 'ttLoadTemplateInSibling', [ '$http', '$templateCache', '$compile', function ( $http, $templateCache, $compile ) {
    return {
      link: function ( scope, element, attrs ) {
        var templateScope = scope.$parent.$new();

        attrs.$observe( 'ttLoadTemplateInSibling', function ( val ) {
          $http.get( val, { cache: $templateCache } )
            .then( function( response ) {
              element.html( response.data );
              $compile( element.contents() )( templateScope );
            });
        });
      }
    };
  }]);


/**
 * The following features are still outstanding: popup delay, animation as a
 * function, placement as a function, inside, support for more triggers than
 * just mouse enter/leave, html popovers, and selector delegatation.
 */
angular.module( 'ui.bootstrap.popover', [ 'ui.bootstrap.tooltip' ] )
  .directive( 'popoverPopup', function () {
    return {
      restrict: 'EA',
      replace: true,
      scope: { title: '@', content: '@', placement: '@', animation: '&', isOpen: '&' },
      templateUrl: 'template/popover/popover.html'
    };
  })
  .directive( 'popover', [ '$tooltip', function ( $tooltip ) {
    return $tooltip( 'popover', 'popover', 'click' );
  }])

  .directive( 'popoverTemplatePopup', function () {
    return {
      restrict: 'EA',
      replace: true,
      scope: { title: '@', content: '@', placement: '@', animation: '&', isOpen: '&', template: '@' },
      templateUrl: 'template/popover/popover-template.html'
    };
  })

  .directive( 'popoverTemplate', [ '$tooltip', function ( $tooltip ) {
    return $tooltip( 'popoverTemplate', 'popover', 'click' );
  }]);




angular.module('ui.bootstrap.progressbar', ['ui.bootstrap.transition'])

  .constant('progressConfig', {
    animate: true,
    autoType: false,
    stackedTypes: ['success', 'info', 'warning', 'danger']
  })

  .controller('ProgressBarController', ['$scope', '$attrs', 'progressConfig', function($scope, $attrs, progressConfig) {

    // Whether bar transitions should be animated
    var animate = angular.isDefined($attrs.animate) ? $scope.$eval($attrs.animate) : progressConfig.animate;
    var autoType = angular.isDefined($attrs.autoType) ? $scope.$eval($attrs.autoType) : progressConfig.autoType;
    var stackedTypes = angular.isDefined($attrs.stackedTypes) ? $scope.$eval('[' + $attrs.stackedTypes + ']') : progressConfig.stackedTypes;

    // Create bar object
    this.makeBar = function(newBar, oldBar, index) {
      var newValue = (angular.isObject(newBar)) ? newBar.value : (newBar || 0);
      var oldValue =  (angular.isObject(oldBar)) ? oldBar.value : (oldBar || 0);
      var type = (angular.isObject(newBar) && angular.isDefined(newBar.type)) ? newBar.type : (autoType) ? getStackedType(index || 0) : null;

      return {
        from: oldValue,
        to: newValue,
        type: type,
        animate: animate
      };
    };

    function getStackedType(index) {
      return stackedTypes[index];
    }

    this.addBar = function(bar) {
      $scope.bars.push(bar);
      $scope.totalPercent += bar.to;
    };

    this.clearBars = function() {
      $scope.bars = [];
      $scope.totalPercent = 0;
    };
    this.clearBars();
  }])

  .directive('progress', function() {
    return {
      restrict: 'EA',
      replace: true,
      controller: 'ProgressBarController',
      scope: {
        value: '=',
        onFull: '&',
        onEmpty: '&'
      },
      templateUrl: 'template/progressbar/progress.html',
      link: function(scope, element, attrs, controller) {
        scope.$watch('value', function(newValue, oldValue) {
          controller.clearBars();

          if (angular.isArray(newValue)) {
            // Stacked progress bar
            for (var i=0, n=newValue.length; i < n; i++) {
              controller.addBar(controller.makeBar(newValue[i], oldValue[i], i));
            }
          } else {
            // Simple bar
            controller.addBar(controller.makeBar(newValue, oldValue));
          }
        }, true);

        // Total percent listeners
        scope.$watch('totalPercent', function(value) {
          if (value >= 100) {
            scope.onFull();
          } else if (value <= 0) {
            scope.onEmpty();
          }
        }, true);
      }
    };
  })

  .directive('progressbar', ['$transition', function($transition) {
    return {
      restrict: 'EA',
      replace: true,
      scope: {
        width: '=',
        old: '=',
        type: '=',
        animate: '='
      },
      templateUrl: 'template/progressbar/bar.html',
      link: function(scope, element) {
        scope.$watch('width', function(value) {
          if (scope.animate) {
            element.css('width', scope.old + '%');
            $transition(element, {width: value + '%'});
          } else {
            element.css('width', value + '%');
          }
        });
      }
    };
  }]);
angular.module('ui.bootstrap.rating', [])

  .constant('ratingConfig', {
    max: 5
  })

  .directive('rating', ['ratingConfig', '$parse', function(ratingConfig, $parse) {
    return {
      restrict: 'EA',
      scope: {
        value: '='
      },
      templateUrl: 'template/rating/rating.html',
      replace: true,
      link: function(scope, element, attrs) {

        var maxRange = angular.isDefined(attrs.max) ? scope.$eval(attrs.max) : ratingConfig.max;

        scope.range = [];
        for (var i = 1; i <= maxRange; i++) {
          scope.range.push(i);
        }

        scope.rate = function(value) {
          if ( ! scope.readonly ) {
            scope.value = value;
          }
        };

        scope.enter = function(value) {
          if ( ! scope.readonly ) {
            scope.val = value;
          }
        };

        scope.reset = function() {
          scope.val = angular.copy(scope.value);
        };
        scope.reset();

        scope.$watch('value', function(value) {
          scope.val = value;
        });

        scope.readonly = false;
        if (attrs.readonly) {
          scope.$parent.$watch($parse(attrs.readonly), function(value) {
            scope.readonly = !!value;
          });
        }
      }
    };
  }]);
angular.module('ui.bootstrap.tabs', [])

  .directive('tabs', function() {
    return function() {
      throw new Error("The `tabs` directive is deprecated, please migrate to `tabset`. Instructions can be found at http://github.com/angular-ui/bootstrap/tree/master/CHANGELOG.md");
    };
  })

  .controller('TabsetController', ['$scope', '$element',
                                   function TabsetCtrl($scope, $element) {
                                     var ctrl = this,
                                         tabs = ctrl.tabs = $scope.tabs = [];

                                     ctrl.select = function(tab) {
                                       angular.forEach(tabs, function(tab) {
                                         tab.active = false;
                                       });
                                       tab.active = true;
                                     };

                                     ctrl.addTab = function addTab(tab) {
                                       tabs.push(tab);
                                       if (tabs.length == 1) {
                                         ctrl.select(tab);
                                       }
                                     };

                                     ctrl.removeTab = function removeTab(tab) {
                                       var index = tabs.indexOf(tab);
                                       //Select a new tab if the tab to be removed is selected
                                       if (tab.active && tabs.length > 1) {
                                         //If this is the last tab, select the previous tab. else, the next tab.
                                         var newActiveIndex = index == tabs.length - 1 ? index - 1 : index + 1;
                                         ctrl.select(tabs[newActiveIndex]);
                                       }
                                       tabs.splice(index, 1);
                                     };
                                   }])

  .directive('tabset', function() {
    return {
      restrict: 'EA',
      transclude: true,
      scope: {},
      controller: 'TabsetController',
      templateUrl: 'template/tabs/tabset.html',
      link: function(scope, element, attrs) {
        scope.vertical = angular.isDefined(attrs.vertical) ? scope.$eval(attrs.vertical) : false;
      }
    };
  })

  .directive('tab', ['$parse', '$http', '$templateCache', '$compile',
                     function($parse, $http, $templateCache, $compile) {
                       return {
                         require: '^tabset',
                         restrict: 'EA',
                         replace: true,
                         templateUrl: 'template/tabs/tab.html',
                         transclude: true,
                         scope: {
                           heading: '@',
                           onSelect: '&select' //This callback is called in contentHeadingTransclude
                           //once it inserts the tab's content into the dom
                         },
                         controller: function() {
                           //Empty controller so other directives can require being 'under' a tab
                         },
                         compile: function(elm, attrs, transclude) {
                           return function postLink(scope, elm, attrs, tabsetCtrl) {
                             var getActive, setActive;
                             scope.active = false; // default value
                             if (attrs.active) {
                               getActive = $parse(attrs.active);
                               setActive = getActive.assign;
                               scope.$parent.$watch(getActive, function updateActive(value) {
                                 if ( !!value && scope.disabled ) {
                                   setActive(scope.$parent, false); // Prevent active assignment
                                 } else {
                                   scope.active = !!value;
                                 }
                               });
                             } else {
                               setActive = getActive = angular.noop;
                             }

                             scope.$watch('active', function(active) {
                               setActive(scope.$parent, active);
                               if (active) {
                                 tabsetCtrl.select(scope);
                                 scope.onSelect();
                               }
                             });

                             scope.disabled = false;
                             if ( attrs.disabled ) {
                               scope.$parent.$watch($parse(attrs.disabled), function(value) {
                                 scope.disabled = !! value;
                               });
                             }

                             scope.select = function() {
                               if ( ! scope.disabled ) {
                                 scope.active = true;
                               }
                             };

                             tabsetCtrl.addTab(scope);
                             scope.$on('$destroy', function() {
                               tabsetCtrl.removeTab(scope);
                             });
                             //If the tabset sets this tab to active, set the parent scope's active
                             //binding too.  We do this so the watch for the parent's initial active
                             //value won't overwrite what is initially set by the tabset
                             if (scope.active) {
                               setActive(scope.$parent, true);
                             }

                             //Transclude the collection of sibling elements. Use forEach to find
                             //the heading if it exists. We don't use a directive for tab-heading
                             //because it is problematic. Discussion @ http://git.io/MSNPwQ
                             transclude(scope.$parent, function(clone) {
                               //Look at every element in the clone collection. If it's tab-heading,
                               //mark it as that.  If it's not tab-heading, mark it as tab contents
                               var contents = [], heading;
                               angular.forEach(clone, function(el) {
                                 //See if it's a tab-heading attr or element directive
                                 //First make sure it's a normal element, one that has a tagName
                                 if (el.tagName &&
                                     (el.hasAttribute("tab-heading") ||
                                      el.hasAttribute("data-tab-heading") ||
                                      el.tagName.toLowerCase() == "tab-heading" ||
                                      el.tagName.toLowerCase() == "data-tab-heading"
                                     )) {
                                       heading = el;
                                 } else {
                                   contents.push(el);
                                 }
                               });
                               //Share what we found on the scope, so our tabHeadingTransclude and
                               //tabContentTransclude directives can find out what the heading and
                               //contents are.
                               if (heading) {
                                 scope.headingElement = angular.element(heading);
                               }
                               scope.contentElement = angular.element(contents);
                             });
                           };
                         }
                       };
                     }])

  .directive('tabHeadingTransclude', [function() {
    return {
      restrict: 'A',
      require: '^tab',
      link: function(scope, elm, attrs, tabCtrl) {
        scope.$watch('headingElement', function updateHeadingElement(heading) {
          if (heading) {
            elm.html('');
            elm.append(heading);
          }
        });
      }
    };
  }])

  .directive('tabContentTransclude', ['$parse', function($parse) {
    return {
      restrict: 'A',
      require: '^tabset',
      link: function(scope, elm, attrs, tabsetCtrl) {
        scope.$watch($parse(attrs.tabContentTransclude), function(tab) {
          elm.html('');
          if (tab) {
            elm.append(tab.contentElement);
          }
        });
      }
    };
  }])

;


angular.module('ui.bootstrap.typeahead', ['ui.bootstrap.position'])

/**
 * A helper service that can parse typeahead's syntax (string provided by users)
 * Extracted to a separate service for ease of unit testing
 */
  .factory('typeaheadParser', ['$parse', function ($parse) {

    //                      00000111000000000000022200000000000000003333333333333330000000000044000
    var TYPEAHEAD_REGEXP = /^\s*(.*?)(?:\s+as\s+(.*?))?\s+for\s+(?:([\$\w][\$\w\d]*))\s+in\s+(.*)$/;

    return {
      parse:function (input) {

        var match = input.match(TYPEAHEAD_REGEXP), modelMapper, viewMapper, source;
        if (!match) {
          throw new Error(
            "Expected typeahead specification in form of '_modelValue_ (as _label_)? for _item_ in _collection_'" +
              " but got '" + input + "'.");
        }

        return {
          itemName:match[3],
          source:$parse(match[4]),
          viewMapper:$parse(match[2] || match[1]),
          modelMapper:$parse(match[1])
        };
      }
    };
  }])

  .directive('typeahead', ['$compile', '$parse', '$q', '$document', '$position', 'typeaheadParser', function ($compile, $parse, $q, $document, $position, typeaheadParser) {

    var HOT_KEYS = [9, 13, 27, 38, 40];

    return {
      require:'ngModel',
      link:function (originalScope, element, attrs, modelCtrl) {

        var selected;

        //minimal no of characters that needs to be entered before typeahead kicks-in
        var minSearch = originalScope.$eval(attrs.typeaheadMinLength) || 1;

        //expressions used by typeahead
        var parserResult = typeaheadParser.parse(attrs.typeahead);

        //should it restrict model values to the ones selected from the popup only?
        var isEditable = originalScope.$eval(attrs.typeaheadEditable) !== false;

        var isLoadingSetter = $parse(attrs.typeaheadLoading).assign || angular.noop;

        //pop-up element used to display matches
        var popUpEl = angular.element(
          "<typeahead-popup " +
            "matches='matches' " +
            "active='activeIdx' " +
            "select='select(activeIdx)' "+
            "query='query' "+
            "position='position'>"+
            "</typeahead-popup>");

        //create a child scope for the typeahead directive so we are not polluting original scope
        //with typeahead-specific data (matches, query etc.)
        var scope = originalScope.$new();
        originalScope.$on('$destroy', function(){
          scope.$destroy();
        });

        var resetMatches = function() {
          scope.matches = [];
          scope.activeIdx = -1;
        };

        var getMatchesAsync = function(inputValue) {

          var locals = {$viewValue: inputValue};
          isLoadingSetter(originalScope, true);
          $q.when(parserResult.source(scope, locals)).then(function(matches) {

            //it might happen that several async queries were in progress if a user were typing fast
            //but we are interested only in responses that correspond to the current view value
            if (inputValue === modelCtrl.$viewValue) {
              if (matches.length > 0) {

                scope.activeIdx = 0;
                scope.matches.length = 0;

                //transform labels
                for(var i=0; i<matches.length; i++) {
                  locals[parserResult.itemName] = matches[i];
                  scope.matches.push({
                    label: parserResult.viewMapper(scope, locals),
                    model: matches[i]
                  });
                }

                scope.query = inputValue;
                //position pop-up with matches - we need to re-calculate its position each time we are opening a window
                //with matches as a pop-up might be absolute-positioned and position of an input might have changed on a page
                //due to other elements being rendered
                scope.position = $position.position(element);
                scope.position.top = scope.position.top + element.prop('offsetHeight');

              } else {
                resetMatches();
              }
              isLoadingSetter(originalScope, false);
            }
          }, function(){
            resetMatches();
            isLoadingSetter(originalScope, false);
          });
        };

        resetMatches();

        //we need to propagate user's query so we can higlight matches
        scope.query = undefined;

        //plug into $parsers pipeline to open a typeahead on view changes initiated from DOM
        //$parsers kick-in on all the changes coming from the view as well as manually triggered by $setViewValue
        modelCtrl.$parsers.push(function (inputValue) {

          resetMatches();
          if (selected) {
            return inputValue;
          } else {
            if (inputValue && inputValue.length >= minSearch) {
              getMatchesAsync(inputValue);
            }
          }

          return isEditable ? inputValue : undefined;
        });

        modelCtrl.$render = function () {
          var locals = {};
          locals[parserResult.itemName] = selected || modelCtrl.$viewValue;
          element.val(parserResult.viewMapper(scope, locals) || modelCtrl.$viewValue);
          selected = undefined;
        };

        scope.select = function (activeIdx) {
          //called from within the $digest() cycle
          var locals = {};
          locals[parserResult.itemName] = selected = scope.matches[activeIdx].model;

          modelCtrl.$setViewValue(parserResult.modelMapper(scope, locals));
          modelCtrl.$render();
        };

        //bind keyboard events: arrows up(38) / down(40), enter(13) and tab(9), esc(27)
        element.bind('keydown', function (evt) {

          //typeahead is open and an "interesting" key was pressed
          if (scope.matches.length === 0 || HOT_KEYS.indexOf(evt.which) === -1) {
            return;
          }

          evt.preventDefault();

          if (evt.which === 40) {
            scope.activeIdx = (scope.activeIdx + 1) % scope.matches.length;
            scope.$digest();

          } else if (evt.which === 38) {
            scope.activeIdx = (scope.activeIdx ? scope.activeIdx : scope.matches.length) - 1;
            scope.$digest();

          } else if (evt.which === 13 || evt.which === 9) {
            scope.$apply(function () {
              scope.select(scope.activeIdx);
            });

          } else if (evt.which === 27) {
            evt.stopPropagation();

            resetMatches();
            scope.$digest();
          }
        });

        $document.bind('click', function(){
          resetMatches();
          scope.$digest();
        });

        element.after($compile(popUpEl)(scope));
      }
    };

  }])

  .directive('typeaheadPopup', function () {
    return {
      restrict:'E',
      scope:{
        matches:'=',
        query:'=',
        active:'=',
        position:'=',
        select:'&'
      },
      replace:true,
      templateUrl:'template/typeahead/typeahead.html',
      link:function (scope, element, attrs) {

        scope.isOpen = function () {
          return scope.matches.length > 0;
        };

        scope.isActive = function (matchIdx) {
          return scope.active == matchIdx;
        };

        scope.selectActive = function (matchIdx) {
          scope.active = matchIdx;
        };

        scope.selectMatch = function (activeIdx) {
          scope.select({activeIdx:activeIdx});
        };
      }
    };
  })

  .filter('typeaheadHighlight', function() {

    function escapeRegexp(queryToEscape) {
      return queryToEscape.replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1");
    }

    return function(matchItem, query) {
      return query ? matchItem.replace(new RegExp(escapeRegexp(query), 'gi'), '<strong>$&</strong>') : query;
    };
  });
angular.module("template/accordion/accordion-group.html", []).run(["$templateCache", function($templateCache) {
  $templateCache.put("template/accordion/accordion-group.html",
                     "<div class=\"accordion-group\">\n" +
                     "  <div class=\"accordion-heading\" ><a class=\"accordion-toggle\" ng-click=\"isOpen = !isOpen\" accordion-transclude=\"heading\">{{heading}}</a></div>\n" +
                     "  <div class=\"accordion-body\" collapse=\"!isOpen\">\n" +
                     "    <div class=\"accordion-inner\" ng-transclude></div>  </div>\n" +
                     "</div>");
}]);

angular.module("template/accordion/accordion.html", []).run(["$templateCache", function($templateCache) {
  $templateCache.put("template/accordion/accordion.html",
                     "<div class=\"accordion\" ng-transclude></div>");
}]);

angular.module("template/alert/alert.html", []).run(["$templateCache", function($templateCache) {
  $templateCache.put("template/alert/alert.html",
                     "<div class='alert' ng-class='type && \"alert-\" + type'>\n" +
                     "    <button ng-show='closeable' type='button' class='close' ng-click='close()'>&times;</button>\n" +
                     "    <div ng-transclude></div>\n" +
                     "</div>\n" +
                     "");
}]);

angular.module("template/carousel/carousel.html", []).run(["$templateCache", function($templateCache) {
  $templateCache.put("template/carousel/carousel.html",
                     "<div ng-mouseenter=\"pause()\" ng-mouseleave=\"play()\" class=\"carousel\">\n" +
                     "    <ol class=\"carousel-indicators\" ng-show=\"slides().length > 1\">\n" +
                     "        <li ng-repeat=\"slide in slides()\" ng-class=\"{active: isActive(slide)}\" ng-click=\"select(slide)\"></li>\n" +
                     "    </ol>\n" +
                     "    <div class=\"carousel-inner\" ng-transclude></div>\n" +
                     "    <a ng-click=\"prev()\" class=\"carousel-control left\" ng-show=\"slides().length > 1\">&lsaquo;</a>\n" +
                     "    <a ng-click=\"next()\" class=\"carousel-control right\" ng-show=\"slides().length > 1\">&rsaquo;</a>\n" +
                     "</div>\n" +
                     "");
}]);

angular.module("template/carousel/slide.html", []).run(["$templateCache", function($templateCache) {
  $templateCache.put("template/carousel/slide.html",
                     "<div ng-class=\"{\n" +
                     "    'active': leaving || (active && !entering),\n" +
                     "    'prev': (next || active) && direction=='prev',\n" +
                     "    'next': (next || active) && direction=='next',\n" +
                     "    'right': direction=='prev',\n" +
                     "    'left': direction=='next'\n" +
                     "  }\" class=\"item\" ng-transclude></div>\n" +
                     "");
}]);

angular.module("template/datepicker/datepicker.html", []).run(["$templateCache", function($templateCache) {
  $templateCache.put("template/datepicker/datepicker.html",
                     "<table class=\"well well-large\">\n" +
                     "  <thead>\n" +
                     "    <tr class=\"text-center\">\n" +
                     "      <th><button class=\"btn pull-left\" ng-click=\"move(-1)\"><i class=\"icon-chevron-left\"></i></button></th>\n" +
                     "      <th colspan=\"{{rows[0].length - 2 + showWeekNumbers}}\"><button class=\"btn btn-block\" ng-click=\"toggleMode()\"><strong>{{title}}</strong></button></th>\n" +
                     "      <th><button class=\"btn pull-right\" ng-click=\"move(1)\"><i class=\"icon-chevron-right\"></i></button></th>\n" +
                     "    </tr>\n" +
                     "    <tr class=\"text-center\" ng-show=\"labels.length > 0\">\n" +
                     "      <th ng-show=\"showWeekNumbers\">#</th>\n" +
                     "      <th ng-repeat=\"label in labels\">{{label}}</th>\n" +
                     "    </tr>\n" +
                     "  </thead>\n" +
                     "  <tbody>\n" +
                     "    <tr ng-repeat=\"row in rows\">\n" +
                     "      <td ng-show=\"showWeekNumbers\" class=\"text-center\"><em>{{ getWeekNumber(row) }}</em></td>\n" +
                     "      <td ng-repeat=\"dt in row\" class=\"text-center\">\n" +
                     "        <button style=\"width:100%;\" class=\"btn\" ng-class=\"{'btn-info': dt.isSelected}\" ng-click=\"select(dt.date)\" ng-disabled=\"dt.disabled\"><span ng-class=\"{muted: ! dt.isCurrent}\">{{dt.label}}</span></button>\n" +
                     "      </td>\n" +
                     "    </tr>\n" +
                     "  </tbody>\n" +
                     "</table>\n" +
                     "");
}]);

angular.module("template/dialog/message.html", []).run(["$templateCache", function($templateCache) {
  $templateCache.put("template/dialog/message.html",
                     "<div class=\"modal-header\">\n" +
                     "  <h3>{{ title }}</h3>\n" +
                     "</div>\n" +
                     "<div class=\"modal-body\">\n" +
                     "  <p>{{ message }}</p>\n" +
                     "</div>\n" +
                     "<div class=\"modal-footer\">\n" +
                     "  <button ng-repeat=\"btn in buttons\" ng-click=\"close(btn.result)\" class=\"btn\" ng-class=\"btn.cssClass\">{{ btn.label }}</button>\n" +
                     "</div>\n" +
                     "");
}]);

angular.module("template/pagination/pagination.html", []).run(["$templateCache", function($templateCache) {
  $templateCache.put("template/pagination/pagination.html",
                     "<div class=\"pagination\"><ul>\n" +
                     "  <li ng-repeat=\"page in pages\" ng-class=\"{active: page.active, disabled: page.disabled}\"><a ng-click=\"selectPage(page.number)\">{{page.text}}</a></li>\n" +
                     "  </ul>\n" +
                     "</div>\n" +
                     "");
}]);

angular.module("template/tooltip/tooltip-html-unsafe-popup.html", []).run(["$templateCache", function($templateCache) {
  $templateCache.put("template/tooltip/tooltip-html-unsafe-popup.html",
                     "<div class=\"tooltip {{placement}}\" ng-class=\"{ in: isOpen(), fade: animation() }\">\n" +
                     "  <div class=\"tooltip-arrow\"></div>\n" +
                     "  <div class=\"tooltip-inner\" ng-bind-html-unsafe=\"content\"></div>\n" +
                     "</div>\n" +
                     "");
}]);

angular.module("template/tooltip/tooltip-popup.html", []).run(["$templateCache", function($templateCache) {
  $templateCache.put("template/tooltip/tooltip-popup.html",
                     "<div class=\"tooltip {{placement}}\" ng-class=\"{ in: isOpen(), fade: animation() }\">\n" +
                     "  <div class=\"tooltip-arrow\"></div>\n" +
                     "  <div class=\"tooltip-inner\" ng-bind=\"content\"></div>\n" +
                     "</div>\n" +
                     "");
}]);

angular.module("template/popover/popover.html", []).run(["$templateCache", function($templateCache) {
  $templateCache.put("template/popover/popover.html",
                     "<div class=\"popover {{placement}}\" ng-class=\"{ in: isOpen(), fade: animation() }\">\n" +
                     "  <div class=\"arrow\"></div>\n" +
                     "\n" +
                     "  <div class=\"popover-inner\">\n" +
                     "      <h3 class=\"popover-title\" ng-bind=\"title\" ng-show=\"title\"></h3>\n" +
                     "      <div class=\"popover-content\" ng-bind=\"content\"></div>\n" +
                     "  </div>\n" +
                     "</div>\n" +
                     "");
}]);

angular.module("template/popover/popover-template.html", []).run(["$templateCache", function($templateCache) {
  $templateCache.put("template/popover/popover-template.html",
                     "<div class=\"popover {{placement}}\"\n" +
//                     "     style=\"width: 400px\"\n" +
                     "     ng-class=\"{ in: isOpen(), fade: animation() }\">\n" +
                     "  <div class=\"arrow\"></div>\n" +
                     "  <div class=\"popover-inner\" tt-load-template-in-sibling=\"{{template}}\"></div>\n" +
                     "</div>\n" +
                     "");
}]);

angular.module("template/progressbar/bar.html", []).run(["$templateCache", function($templateCache) {
  $templateCache.put("template/progressbar/bar.html",
                     "<div class=\"bar\" ng-class='type && \"bar-\" + type'></div>");
}]);

angular.module("template/progressbar/progress.html", []).run(["$templateCache", function($templateCache) {
  $templateCache.put("template/progressbar/progress.html",
                     "<div class=\"progress\"><progressbar ng-repeat=\"bar in bars\" width=\"bar.to\" old=\"bar.from\" animate=\"bar.animate\" type=\"bar.type\"></progressbar></div>");
}]);

angular.module("template/rating/rating.html", []).run(["$templateCache", function($templateCache) {
  $templateCache.put("template/rating/rating.html",
                     "<span ng-mouseleave=\"reset()\">\n" +
                     "  <i ng-repeat=\"number in range\" ng-mouseenter=\"enter(number)\" ng-click=\"rate(number)\" ng-class=\"{'icon-star': number <= val, 'icon-star-empty': number > val}\"></i>\n" +
                     "</span>\n" +
                     "");
}]);

angular.module("template/tabs/tab.html", []).run(["$templateCache", function($templateCache) {
  $templateCache.put("template/tabs/tab.html",
                     "<li ng-class=\"{active: active, disabled: disabled}\">\n" +
                     "  <a ng-click=\"select()\" tab-heading-transclude>{{heading}}</a>\n" +
                     "</li>\n" +
                     "");
}]);

angular.module("template/tabs/tabset.html", []).run(["$templateCache", function($templateCache) {
  $templateCache.put("template/tabs/tabset.html",
                     "\n" +
                     "<div class=\"tabbable\">\n" +
                     "  <ul class=\"nav nav-tabs\" ng-class=\"{'nav-stacked': vertical}\" ng-transclude>\n" +
                     "  </ul>\n" +
                     "  <div class=\"tab-content\">\n" +
                     "    <div class=\"tab-pane\" \n" +
                     "         ng-repeat=\"tab in tabs\" \n" +
                     "         ng-class=\"{active: tab.active}\"\n" +
                     "         tab-content-transclude=\"tab\" tt=\"tab\">\n" +
                     "    </div>\n" +
                     "  </div>\n" +
                     "</div>\n" +
                     "");
}]);

angular.module("template/typeahead/typeahead.html", []).run(["$templateCache", function($templateCache) {
  $templateCache.put("template/typeahead/typeahead.html",
                     "<ul class=\"typeahead dropdown-menu\" ng-style=\"{display: isOpen()&&'block' || 'none', top: position.top+'px', left: position.left+'px'}\">\n" +
                     "    <li ng-repeat=\"match in matches\" ng-class=\"{active: isActive($index) }\" ng-mouseenter=\"selectActive($index)\">\n" +
                     "        <a tabindex=\"-1\" ng-click=\"selectMatch($index)\" ng-bind-html-unsafe=\"match.label | typeaheadHighlight:query\"></a>\n" +
                     "    </li>\n" +
                     "</ul>");
}]);
