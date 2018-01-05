// Get JSON data and execute a callback
function getDataJSON(callback, month, year) {

  // Get uri for data with specific month and year
  var queryString = "/data?";
  var query = $.param({"month":month, "year":year});

  // Get data and call the callback
  $.getJSON(queryString+query)
    .then(callback)
    .done(function(data) {
      document.getElementById('loading').style.display = 'none'; // hide loading page
    })
    .fail(function() { // show the error message
      document.getElementById('loading').style.display = 'none';
      document.getElementById('error-wrapper').style.display = 'block';
    });
}

// Make the complete dashboard
function makeDashboard(recordsJson) {

  // Initialize the leaflet map
  map = L.map('map', {zoomControl: false}).setView([39.952583, -75.165222], 11);

  // Overlays layer group will hold the hex bin layer
  overlays = L.layerGroup().addTo(map);

  // The tooltip for the map to show total count per hex bin
  function tooltip() {

    // Generate the tooltip
    var tooltip = d3.select('body').append('div')
      .attr('class', 'hexbin-tooltip')
      .style('z-index', 9999)
      .style('pointer-events', 'none')
      .style('visibility', 'hidden')
      .style('position', 'absolute');

    tooltip.append('div').attr('class', 'tooltip-content');

    // Return the handler instance
    return {

      mouseover: function (hexLayer, data) {
        var event = d3.event;
        var gCoords = d3.mouse(this);

        tooltip
          .style('visibility', 'visible')
          .html('Count: ' + data.length);

        tooltip
          .style("top", (d3.event.pageY + 10) + "px")
          .style("left", (d3.event.pageX + 10) + "px");

      },

      mouseout: function (hexLayer, data) {

        tooltip
          .style('visibility', 'hidden')
          .html();
        }
    };
  }

  // Initialize the hex bin layer
  hexLayer = L.hexbinLayer({radius:12, opacity:0.8})
                .hoverHandler(L.HexbinHoverHandler.compound({
                  handlers: [
                    L.HexbinHoverHandler.resizeFill(),
                    tooltip()
                  ]
                }));

  // Set hex bin color scale
  var colorRange = [d3.interpolateReds(0.1), d3.interpolateReds(0.5),d3.interpolateReds(0.75), d3.interpolateReds(1)];
  hexLayer.colorScale().range(colorRange);

  // Other hex layer options
  hexLayer
     .radiusRange([5, 12])
     .lng(function(d) { return d[0]; })
     .lat(function(d) { return d[1]; })
     .colorValue(function(d) { return d.length; })
     .radiusValue(function(d) { return d.length; });

  // Parse datetime strings in input time stamps
  var parseTime = d3.timeParse("%Y-%m-%d %H:%M:%S");
  recordsJson.forEach(function(d) {
    d["timestamp"] = parseTime(d["timestamp"]);
  });

  // Create a Crossfilter instance
  var ndx = crossfilter(recordsJson);

  // Define Dimensions
  var dateDim = ndx.dimension(function(d) { return d["timestamp"]; });
  var zipcodeDim = ndx.dimension(function(d) { return d["violation_location_zip"]; });
  var fineDim = ndx.dimension(function(d) { return d["fine"]; });
  var descDim = ndx.dimension(function(d) { return d["violation_description"]; });
  var dayhourDim = ndx.dimension(function(d) { return [d['dayofweek'], d['hour']]})
  var agencyDim = ndx.dimension(function(d) { return d["issuing_agency"]; });
  var allDim = ndx.dimension(function(d) {return d;});

  // Group data
  var numRecordsByDate = dateDim.group();
  var zipcodeGroup = zipcodeDim.group();
  var agencyGroup = agencyDim.group();
  var agencyCountGroup = agencyDim.group().reduceCount();
  var descGroup = descDim.group();
  var dayhourGroup = dayhourDim.group().reduceCount();
  var all = ndx.groupAll();

  // Min and Max date for axis bounds
  var minDate = dateDim.bottom(1)[0]["timestamp"];
  var maxDate = dateDim.top(1)[0]["timestamp"];

  // Count total records and total revenue
  var revenueGroup = ndx.groupAll().reduce(
      function (p, v) {
        ++p.n;
        p.tot += v.fine;
        return p;
      },
      function (p, v) {
        --p.n;
        p.tot -= v.fine;
        return p;
      },
      function () { return {n:0,tot:0}; }
  );

  // Keep track of the original ordering of row charts
  function save_first_order() {

    var original_value = {};
    return function(chart) {
      chart.group().all().forEach(function(kv) {
        original_value[kv.key] = kv.value;
      });
      chart.ordering(function(kv) {
        return -original_value[kv.key];
      });
    };
  }

  // Initialize the charts
  var numberTicketsND = dc.numberDisplay("#number-records-nd");
  var numberRevenueND = dc.numberDisplay("#number-revenue-nd");
  zipcodeChart = dc.rowChart("#zipcode-row-chart");
  descChart = dc.rowChart("#ticket-type-row-chart");
  agencyChart = dc.rowChart("#agency-row-chart");
  heatChart = dc.heatMap("#day-hour-chart");
  timeChart = dc.barChart("#time-chart");

  // Bar chart to show number of tickets per hour
  timeChart
    .width(1250)
    .height(140)
    .margins({top: 10, right: 10, bottom: 20, left: 30})
    .dimension(dateDim)
    .group(numRecordsByDate)
    .transitionDuration(500)
    .x(d3version3.time.scale().domain([minDate, maxDate]))
    .elasticY(true)
    .useViewBoxResizing(true)
    .on('filtered', function (chart) {
        addHexLayer(allDim.top(Infinity));
        displayTimeFilter(chart);
        toggleReset(chart, 'time-chart-reset');
    })
    .yAxis().ticks(4)

    // Show current filters for time chart
    function displayTimeFilter(chart) {
      var filters = chart.filters();
      var t = document.getElementById("time-chart-filter");
      if(filters.length) {
          var range = filters[0];
          console.log('range:', range[0], range[1]);
          var format = d3version3.time.format("%m/%d/%Y");
          t.innerHTML = "<b>selected</b>: " + format(range[0]) + ' to ' + format(range[1]);
          t.style.display = 'block';
      }
      else {
        t.innerHTML = "";
        t.style.display = 'none'
      }
    }

    // Change x axis to be every 2 days
    timeChart.xAxis()
      .ticks(d3version3.time.days, 2)
      .tickFormat(d3version3.time.format('%a %d'));

    // Number of tickets number display
    numberTicketsND
      .formatNumber(d3.format(",d"))
      .valueAccessor(function(d) { return d.n;})
      .group(revenueGroup);

    // Total revenue number display
    numberRevenueND
      .formatNumber(d3.format("$,.0f"))
      .valueAccessor(function(d) { return d.tot;})
      .group(revenueGroup);

    // Row chart by zip code
    zipcodeChart
      .width(35 * 7 + 80)
      .height(35 * 24 + 80)
      .dimension(zipcodeDim)
      .group(zipcodeGroup)
      .colors(['#6baed6'])
      .elasticX(true)
      .useViewBoxResizing(true)
      .on('postRender', save_first_order())
      .on('filtered', function (chart) {
            addHexLayer(allDim.top(Infinity));
            toggleReset(chart, 'zipcode-chart-reset');
            toggleReset(chart, 'map-reset');
      })
      .xAxis().ticks(4);

    // Row chart showing violation description
    descChart
      .width(300)
      .height(400)
      .dimension(descDim)
      .group(descGroup)
      .colors('#6baed6')
      .elasticX(true)
      .useViewBoxResizing(true)
      .on('postRender', save_first_order())
      .on('filtered', function (chart) {
          addHexLayer(allDim.top(Infinity));
          toggleReset(chart, 'desc-chart-reset');
      })
      .xAxis().ticks(4);

    // Row chart showing type of agency
    agencyChart
      .width(400)
      .height(180)
      .dimension(agencyDim)
      .group(agencyGroup)
      .colors('#6baed6')
      .elasticX(false)
      .on('postRender', save_first_order())
      .useViewBoxResizing(true)
      .on('filtered', function (chart) {
          displayAgencyFilter(chart);
          addHexLayer(allDim.top(Infinity));
          toggleReset(chart, 'agency-chart-reset');

      });

    // set a log scale
    agencyChart.x(d3version3.scale.log()
                  .range([0,(agencyChart.width()-50)])
                  .nice()
                  .clamp(true)
                  .domain([.5, 10*ndx.size()]));
    agencyChart.xAxis().scale(agencyChart.x());


    // Toggle the reset all text for filters
    function toggleResetAll(chart) {
      var filters = chart.filters();
      var t = document.getElementById("reset-all");
      if(filters.length) {
          t.style.display = 'block';
      }
      else {
        t.style.display = 'none'
      }
    }

    // Toggle reset text for individual chart
    function toggleReset(chart, id) {
      var filters = chart.filters();
      var t = document.getElementById(id);
      var this_script = $('#'+id).data('reset-script');
      if (filters.length) {
          t.innerHTML = t.title + " <a href=" + this_script + ">[reset]</a>";
      }
      else {
        t.innerHTML = t.title;
      }
      toggleResetAll(chart);
    }

    // Display agency filters
    function displayAgencyFilter(chart) {
      var filters = chart.filters();
      var t = document.getElementById("agency-chart-filter");
      if(filters.length) {
          t.innerHTML = "<b>selected</b>: " + filters;
          t.style.display = 'block';
      }
      else {
        t.innerHTML = "";
        t.style.display = 'none'
      }
    }

    // Heat map of hour vs day of week
    daysOfWeek = ["Mon", "Tues", "Wed", "Thurs", "Fri", "Sat", "Sun"];
    heatChart
      .rowsLabel(function (d) { return d3.format("02d")(d)+":00"; })
      .colsLabel(function (d) { return ["M", "T", "W", "Th", "F", "Sat", "Sun"][+d]})
      .width(35 * 7 + 80)
      .height(35 * 24 + 80)
      .dimension(dayhourDim)
      .group(dayhourGroup)
      .rowOrdering(d3.descending)
      .keyAccessor(function(d) { return +d.key[0]; })
      .valueAccessor(function(d) { return +d.key[1]; })
      .colorAccessor(function(d) { return +d.value; })
      .useViewBoxResizing(true)
      .on('filtered', function (chart) {
          addHexLayer(allDim.top(Infinity));
          toggleReset(chart, 'dayhour-chart-reset');
      })
      .title(function(d) {
        return "Day:   " + daysOfWeek[+d.key[0]] + "\n" +
               "Hour:  " + d3.format("02d")(d.key[1])+":00" + "\n" +
               "Total: " + d.value;})
      .colors(['#0d0a29',
               '#271258',
               '#491078',
               '#671b80',
               '#862781',
               '#a6317d',
               '#c53c74',
               '#e34e65',
               '#f66c5c',
               '#fc9065',
               '#feb67c',
               '#fdda9c'])
      .calculateColorDomain()
      .on('preRedraw', function() {
        heatChart.calculateColorDomain();
      })

    // Load the base tile layer
    L.tileLayer('https://cartodb-basemaps-{s}.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="http://cartodb.com/attributions">CartoDB</a>',
      subdomains: 'abcd',
      maxZoom: 18,
      minZoom: 10
    }).addTo(map);

    // Add the zoom control with a home reset button
    var zoomHome = L.Control.zoomHome();
    zoomHome.addTo(map);

    // Control that shows state info on hover
    var info = L.control();

    // Create info div to show selected zip code
    info.onAdd = function (map) {
        this._div = L.DomUtil.create('div', 'info');
        this.update();
        return this._div;
    };

    // Specify update for info legend
    info.update = function (props) {
      if (props) {
        this._div.style.visibility = "visible";
        this._div.innerHTML = '<h4>Zip Code</h4>' + '<b>' + props.CODE + '</b>';
      } else {
        this._div.style.visibility = "hidden";
      }
    };
    info.addTo(map);

    // Initialize the zip code json
    var geojson;

    // Style the map when selecting specific zip codes
    var highlightedStyle = {
        weight: 5,
        color: '#666',
        dashArray: '',
        opacity:1,
        fillOpacity: 0.
    };
    var unhighlightedStyle = {
      weight: 1.,
      opacity: 0.5,
      color: '#666',
      dashArray: '',
      fillOpacity: 0.,
    };

    // create geo JSON from zip code data
    geojson = L.geoJson(zipCodes, {
        style: function(feature) { return unhighlightedStyle; },
    });

    // Set events
    geojson
      .addTo(map)
      .on("mouseover", function(event) {
        event.layer.setStyle(highlightedStyle);
        info.update(event.layer.feature.properties);
      })
      .on("mouseout", function(event) {
        event.layer.setStyle(unhighlightedStyle);
        info.update();
      });

    // Add map listener to highlight zip code
    map.on("mousemove", function(event) {
      var latlng = event.latlng;

      geojson.fireEvent("mouseout", {
        latlng: latlng,
        layerPoint: event.layerPoint,
        containerPoint: event.containerPoint,
        originalEvent: event.originalEvent,
        layer: geojson
      });

      // Use Mapbox Leaflet PIP (point in polygon) library.
      var layers = leafletPip.pointInLayer(latlng, geojson);
      layers.forEach(function(layer) {
        geojson.fireEvent("mouseover", {
          latlng: latlng,
          layerPoint: event.layerPoint,
          containerPoint: event.containerPoint,
          originalEvent: event.originalEvent,
          layer: layer
          });
        });
    });

    // Add map listener to filter based on clicked zip code on map
    map.on("click", function (event) {

      var clickedLayers = leafletPip.pointInLayer(event.latlng, geojson);
      jQuery.each(clickedLayers, function(i, layer) {
        var code = +layer.feature.properties.CODE;
        var filters = zipcodeChart.filters();
        console.log("FILTERS = ", filters);
        console.log("CODE = ", +code);
        if (filters.length == 0) {
          zipcodeChart.replaceFilter([[code]]);
        }
        else {
          var index = filters.indexOf(code);
          if (index == -1) {
            console.log("HEY 1");
            console.log(filters);
            console.log("HEY 2");
            filters.push(code);
          } else {
            filters.splice(index, 1);
          }
          zipcodeChart.replaceFilter([filters]);
          console.log(filters);
        }
        dc.redrawAll();
      });
    });

  // Track leaflet layer ID for each zip code
  zipcodeToLayerID = {};
  geojson.eachLayer(function (layer) {
    zipcodeToLayerID[+layer.feature.properties.CODE] = layer._leaflet_id;
  });

  // Highlight map when mouse over zip code chart
  zipcodeChart.on('renderlet', function(chart) {
    chart
      .selectAll(`g.row`)
      .on('mouseover.highlighted-zip', function(d) {
        var layer = geojson.getLayer(zipcodeToLayerID[d.key]);
        layer.setStyle(highlightedStyle);
        info.update(layer.feature.properties);
      })
      .on('mouseout.highlighted-zip', function(d) {
        var layer = geojson.getLayer(zipcodeToLayerID[d.key]);
        layer.setStyle(unhighlightedStyle);
        info.update();
      });
  });

  // Add the hex bin layer to the map with currently filtered data
  addHexLayer(allDim.top(Infinity));

  // Render all charts
  dc.renderAll();

  function addXAxis(chartToUpdate, displayText) {
    chartToUpdate.svg()
              .append("text")
              .attr("class", "x-axis-label")
              .attr("text-anchor", "middle")
              .attr("x", chartToUpdate.width()/2)
              .attr("y", chartToUpdate.height())
              .text(displayText);
  }

  // Add x axis labels
  addXAxis(zipcodeChart, "Number of Tickets");
  addXAxis(descChart, "Number of Tickets");
  addXAxis(agencyChart, "Number of Tickets");

}

// Add the hex bin layer to the map
function addHexLayer(recordsJson) {

  // Get coordinate pairs for each record
  var coords = [];
  jQuery.each(recordsJson, function (i, val) {
    coords.push([val["longitude"], val["latitude"]]);
  });

  // Update the layer data
  hexLayer.data(coords);

  // Add to the overlay group
  hexLayer.addTo(overlays);
}

// Get data and make dashboard
// Default is January 2016
getDataJSON(makeDashboard, 1, 2016);

// Show the loading page on load
window.onload = function(e){
  document.getElementById('loading').style.display = 'block';
}
