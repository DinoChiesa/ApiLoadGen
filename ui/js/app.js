/*global Log: false */

function simpleDateFormatter(theDate, format) {
  var formattedDate = '', d;
  format = format || 'Y M d'; // default
  if (typeof theDate === 'undefined') {
    formattedDate = '--';
  }
  else if (theDate === null) { }
  else if (angular.isNumber(theDate)) {
    if (theDate>0) {
      d = new Date(theDate);
      formattedDate = d.format(format);
    }
    else {
      formattedDate = '--';
    }
  }
  else if (typeof theDate === 'string') {
    d = new Date(Date.parse(theDate));
    formattedDate = d.format(format);
  }
  else if (theDate instanceof Date) {
    formattedDate = theDate.format(format);
  }
  return formattedDate;
}

var log = new Log('logging');
log.write('hello app.js');

angular

 .module('loadgenui', ['ui.bootstrap'])
  .config(function ($routeProvider) {
    $routeProvider
      .when('/', {
        templateUrl: 'views/main.htm',
        controller: 'MainController'
      })
      .otherwise({
        redirectTo: '/'
      });
      //$locationProvider.html5Mode(true);
  })

  // edit-in-place attribute
  .directive( 'editInPlace', function() {
    return {
      restrict: 'A',
      scope: { value: '=editInPlace', onSaveFn: '&onSave', onCancelFn: '&onCancel' },
      template: '<span ng-click="handleClick()" ng-bind="value"></span><textarea ng-model="value" style="width:100%;"></textarea>',
      link: function ( $scope, element, attrs ) {
        // Let's get a reference to the input element, as we'll want to reference it.
        var spanChild = angular.element( element.children()[0] ),
            inputChild = angular.element( element.children()[1] ),
            previousValue;

        element.addClass( 'edit-in-place' );
        $scope.editing = false;

        $scope.handleClick = function() {
          if ( ! $scope.editing) {
            $scope.beginEdit();
          }
        };

        // optionally restrict legal characters with a regex
        if (attrs.restrictTo) {
          var re1 = new RegExp(attrs.restrictTo, 'g');
          $scope.$watch(attrs.ngModel, function(value) {
            if (!value) {
              return;
            }
            $parse(attrs.ngModel)
              .assign($scope,
                      value
                      .toLowerCase()
                      .replace(re1, '')
                      .replace(/\s+/g, '-'));
          });
        }

        if (attrs.editWidth) {
          // explicitly specify the width of the edit box.
          var editWidth = parseFloat(attrs.editWidth);
          inputChild.css( 'width', attrs.editWidth);
          // Also specify the width of the containing div, so that
          // when the editbox appears, the div is large enough to hold it
          // without expanding. This makes tables remain stable when
          // the editboxes appear and disappear within TD's.
          spanChild.parent().css( 'min-width', (editWidth + 12) + 'px');
        }

        // activate editing mode
        $scope.beginEdit = function () {
          $scope.editing = true;
          previousValue = $scope.value;

          // When the css class is 'active', the input box gets displayed.
          // See the css for details.
          element.addClass( 'active' );

          // Now, focus the element.
          // `angular.element()` returns a chainable array, like jQuery. To access
          // a native DOM function, reference the first element in the array.
          inputChild[0].focus();
        };

        // When the user leaves the input, stop editing and accept the changes
        inputChild.prop( 'onblur', function() {
          if ( $scope.editing ) {
            $scope.acceptEdits();
          }
        });

        // has the user pressed the RETURN or ESCAPE key from within the input box?
        inputChild.prop( 'onkeyup', function(e) {
          if ($scope.editing) {
            if (e.keyCode === 13) {
              $scope.acceptEdits();
            }
            else if (e.keyCode === 27) {
              $scope.cancelEdits();
            }
          }
        });

        // Accept edits
        $scope.acceptEdits = function () {
          if ($scope.editing) {
            $scope.editing = false;
            element.removeClass( 'active' );
            if ($scope.value !== previousValue) {
              $scope.onSaveFn({value: $scope.value, previousValue: previousValue});
            }
          }
        };

        // Cancel edits
        $scope.cancelEdits = function () {
          if ($scope.editing) {
            $scope.editing = false;
            element.removeClass( 'active' );
            // wrap this assignment so that the view gets updated
            $scope.$apply(function() {
              $scope.value = previousValue;
            });
            $scope.onCancelFn({value: $scope.value});
          }
        };
      }
    };
  })

// textarea-popover element
  .directive( 'textareaPopover', function( /* $compile, $http */) {
    return {
      restrict: 'E',
      scope: { item : '=ngModel', onSave:'&' },
      templateUrl: 'views/textarea-popover.htm',
      link: function (scope /*, elt, attrs */) {
        var origValue;
        scope.stopEdits = function() {
          scope.isEditing = false;
          scope.popoverStyle = {display:'none'};
          scope.editBoxStyle = {display:'none'};
        };

        scope.stopEdits();

        scope.directiveMouseOver = function( /* thing */) {
          if (!scope.isEditing ) {
            // display the popout only if not already editing
            scope.popoverStyle = {display:'block'};
          }
        };

        scope.directiveMouseLeave = function( /* thing */) {
          scope.popoverStyle = {display:'none'};
        };

        scope.discardEdits = function() {
          scope.stopEdits();
          scope.item.notes = origValue || '';
        };

        scope.acceptEdits = function() {
          scope.stopEdits();
          scope.onSave({previousValue: origValue});
        };

        scope.toggleEdits = function( /* $event */) {
          if (scope.isEditing) {
            scope.discardEdits();
          }
          else {
            origValue = scope.item.notes || '';
            scope.isEditing = true;
            scope.editBoxStyle = {display:'block'};
            scope.popoverStyle = {display:'none'};
          }
        };
      }
    };
  })

  .directive('dpcDateFormat', function ($window) {
    return {
      require:'^ngModel',
      restrict:'A',
      link:function (scope, elm, attrs, ctrl) {
        var dateFormat = attrs.dpcDateFormat;

        attrs.$observe('dpcDateFormat', function (newValue) {
          if (dateFormat == newValue || !ctrl.$modelValue) return;
          dateFormat = newValue;
          ctrl.$modelValue = new Date(ctrl.$setViewValue);
        });

        ctrl.$formatters.unshift(function (modelValue) {
          //scope = scope;
          if (!dateFormat || !modelValue) return "";
          return simpleDateFormatter(modelValue, dateFormat);
        });

        ctrl.$parsers.unshift(function (viewValue) {
          //scope = scope;
          var date = new Date(viewValue);
          return (date && date.isValid() && date.year() > 1950 ) ? date.toDate() : "";
        });
      }
    };
  })

  .directive('notUsedRestrictTo', function($parse) {
    return {
      restrict: 'A',
      require: 'ngModel',
      link: function(scope, iElement, iAttrs, controller) {
        scope.$watch(iAttrs.ngModel, function(value) {
          if (!value) {
            return;
          }
          $parse(iAttrs.ngModel)
            .assign(scope,
                    value
                    .toLowerCase()
                    .replace(new RegExp(iAttrs.restrict, 'g'), '')
                    .replace(/\s+/g, '-'));
        });
      }
    };
  })

// for popovers with a template
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
  }])

  .filter('dateFullFormatter', function() {
    // filter is a factory function
    return function(theDate) {
      return simpleDateFormatter(theDate, 'Y M d H:i:s');
    };
  })

  .filter('dateOnlyFormatter', function() {
    // filter is a factory function
    return function(theDate) {
      return simpleDateFormatter(theDate, 'Y M d');
    };
  });


angular
  .module("template/popover/popover-template.html", [])
  .run(["$templateCache", function($templateCache) {
    $templateCache.put("views/popover-template.html",
                       "<div class=\"popover {{placement}}\"\n" +
                       //                     "     style=\"width: 400px\"\n" +
                       "     ng-class=\"{ in: isOpen(), fade: animation() }\">\n" +
                       "  <div class=\"arrow\"></div>\n" +
                       "  <div class=\"popover-inner\" tt-load-template-in-sibling=\"{{template}}\"></div>\n" +
                       "</div>\n" +
                       "");
  }]);

log.write('ng configured');
