/* Keele arboretum map — ES5 for older browsers */
(function () {
  var KEELE_FALLBACK = [53.004, -2.267];
  var ZOOM_FALLBACK = 15;
  var MAX_HIGHLIGHT_MARKERS = 200;
  var MAX_LIST_ITEMS = 200;

  function getQueryParams() {
    var out = {};
    var q = window.location.search;
    if (!q || q.length < 2) {
      return out;
    }
    var pairs = q.substring(1).split("&");
    for (var i = 0; i < pairs.length; i++) {
      var parts = pairs[i].split("=");
      var k = parts[0] ? decodeURIComponent(parts[0].replace(/\+/g, " ")) : "";
      if (!k) {
        continue;
      }
      var v = parts.length > 1 ? decodeURIComponent(parts.slice(1).join("=").replace(/\+/g, " ")) : "";
      out[k] = v;
    }
    return out;
  }

  function escapeHtml(s) {
    if (s === null || s === undefined) {
      return "";
    }
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function propsToPopupHtml(props) {
    var rows = [];
    var title = props.latin_name || props.species || "Tree";
    var subtitle = props.latin_name && props.species ? props.species : "";
    var html = '<div class="tree-popup">';
    html += '<h3 class="tree-popup-title">' + escapeHtml(title) + '</h3>';
    if (subtitle) {
      html += '<p class="tree-popup-subtitle">' + escapeHtml(subtitle) + '</p>';
    }
    if (props.tag !== undefined && props.tag !== null && props.tag !== "") {
      rows.push(["Tag", props.tag]);
    }
    if (props.square) {
      rows.push(["Square", props.square]);
    }
    if (props.planted) {
      rows.push(["Planted", props.planted]);
    }
    if (props.w3w) {
      rows.push(["what3words", props.w3w]);
    }
    if (rows.length) {
      html += '<div class="tree-popup-meta">';
      for (var i = 0; i < rows.length; i++) {
        html += '<div class="tree-popup-row"><span class="tree-popup-label">' +
          escapeHtml(rows[i][0]) + '</span><span class="tree-popup-value">' +
          escapeHtml(rows[i][1]) + '</span></div>';
      }
      html += '</div>';
    }
    if (props.memorial_commemorative) {
      html += "<span class=\"popup-memorial\">" + escapeHtml(props.memorial_commemorative) + "</span>";
    }
    if (props.comments) {
      html += "<span class=\"popup-comments\">" + escapeHtml(props.comments) + "</span>";
    }
    if (props.source_sheet) {
      html += "<span class=\"popup-meta\">Layer: " + escapeHtml(props.source_sheet) + "</span>";
    }
    html += "</div>";
    return html;
  }

  var touchHitRenderer = L.canvas({ tolerance: 10 });

  function makePointToLayer(style) {
    return function (feature, latlng) {
      var markerStyle = { renderer: touchHitRenderer };
      for (var k in style) {
        if (style.hasOwnProperty(k)) {
          markerStyle[k] = style[k];
        }
      }
      return L.circleMarker(latlng, markerStyle);
    };
  }

  function onEachFeature(popupLayer) {
    return function (feature, layer) {
      if (!feature.properties) {
        return;
      }
      layer.on("click", function () {
        setSelectedTreeMarker(layer);
      });
      layer.bindPopup(propsToPopupHtml(feature.properties));
      if (popupLayer) {
        popupLayer.push(layer);
      }
    };
  }

  function loadGeoJSON(url, done) {
    var req = new XMLHttpRequest();
    var cacheBuster = window.APP_CACHE_BUSTER || "";
    var requestUrl = cacheBuster ? url + (url.indexOf("?") === -1 ? "?" : "&") + "_refresh=" + encodeURIComponent(cacheBuster) : url;
    req.open("GET", requestUrl, true);
    req.onreadystatechange = function () {
      if (req.readyState !== 4) {
        return;
      }
      if (req.status >= 200 && req.status < 300) {
        try {
          var data = JSON.parse(req.responseText);
          done(null, data);
        } catch (e) {
          done(e);
        }
      } else {
        done(new Error("HTTP " + req.status + " for " + requestUrl));
      }
    };
    req.send();
  }

  function buildLayer(geojson, style, layerRef) {
    var popupLayers = [];
    var layer = L.geoJSON(geojson, {
      pointToLayer: makePointToLayer(style),
      onEachFeature: onEachFeature(popupLayers)
    });
    layerRef.list = popupLayers;
    return layer;
  }

  var map = L.map("map").setView(KEELE_FALLBACK, ZOOM_FALLBACK);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);

  var cherriesLayerRef = { list: [] };
  var otherLayerRef = { list: [] };

  var cherriesLayer = null;
  var otherLayer = null;

  var cherriesLabels = null;
  var otherLabels = null;
  var labelsVisible = false;
  var searchHighlightLayer = null;
  var searchHoverLayer = null;
  var currentSearchResults = [];
  var currentSearchQuery = "";
  var searchListExpanded = false;
  var activeSearchIndex = -1;
  var locationWatchId = null;
  var userLocationLayer = null;
  var hasCenteredOnUser = false;
  var lastAcceptedPosition = null;
  var selectedTreeMarker = null;
  var selectedTreeOriginalStyle = null;
  var MAX_POSITION_AGE_MS = 15000;
  var MAX_WORSE_ACCURACY_JUMP_METERS = 60;
  var loadErrors = [];
  var noticeDismissTimer = null;
  var dataLoadStartedAt = 0;
  var MIN_LOADING_NOTICE_MS = 700;

  function setNotice(message, kind) {
    var el = document.getElementById("app-notice");
    if (!el) return;
    if (noticeDismissTimer) {
      clearTimeout(noticeDismissTimer);
      noticeDismissTimer = null;
    }
    if (!message) {
      el.className = "app-notice";
      el.textContent = "";
      return;
    }
    el.className = "app-notice is-visible app-notice-" + (kind || "info");
    el.textContent = message;
  }

  function setTemporaryNotice(message, kind, durationMs) {
    setNotice(message, kind);
    noticeDismissTimer = setTimeout(function () {
      setNotice("");
    }, durationMs || 3500);
  }

  function setSearchExpanded(isExpanded) {
    var input = document.getElementById("search-input");
    if (input) {
      input.setAttribute("aria-expanded", isExpanded ? "true" : "false");
    }
  }

  function setActiveSearchIndex(index) {
    var container = document.getElementById("search-results");
    if (!container) return;
    var items = container.querySelectorAll(".search-result-item");
    activeSearchIndex = -1;
    for (var i = 0; i < items.length; i++) {
      items[i].className = items[i].className.replace(/\bis-active\b/g, "").replace(/\s+/g, " ");
      items[i].setAttribute("aria-selected", "false");
    }
    if (index < 0 || index >= items.length) {
      return;
    }
    activeSearchIndex = index;
    items[index].className += " is-active";
    items[index].setAttribute("aria-selected", "true");
    items[index].focus();
  }

  function buildLabelsLayer(geojson, className) {
    var labelsGroup = L.layerGroup();
    var features = geojson.features || [];
    for (var i = 0; i < features.length; i++) {
      var f = features[i];
      if (!f.geometry || f.geometry.type !== "Point") {
        continue;
      }
      var tag = f.properties && f.properties.tag;
      if (tag === undefined || tag === null || tag === "") {
        continue;
      }
      var coords = f.geometry.coordinates;
      var latlng = [coords[1], coords[0]];
      var icon = L.divIcon({
        className: "tree-label " + className,
        html: '<span>' + escapeHtml(tag) + '</span>',
        iconSize: null,
        iconAnchor: [-8, 4]
      });
      var marker = L.marker(latlng, { icon: icon, interactive: false });
      labelsGroup.addLayer(marker);
    }
    return labelsGroup;
  }

  function updateLabelsVisibility() {
    if (labelsVisible) {
      if (cherriesLabels && cherriesLayer && map.hasLayer(cherriesLayer)) {
        map.addLayer(cherriesLabels);
      }
      if (otherLabels && otherLayer && map.hasLayer(otherLayer)) {
        map.addLayer(otherLabels);
      }
    } else {
      if (cherriesLabels) {
        map.removeLayer(cherriesLabels);
      }
      if (otherLabels) {
        map.removeLayer(otherLabels);
      }
    }
  }

  var allFeatures = [];

  function getMarkerStyleSnapshot(layer) {
    if (!layer || !layer.options) {
      return null;
    }
    return {
      radius: layer.options.radius,
      fillColor: layer.options.fillColor,
      color: layer.options.color,
      weight: layer.options.weight,
      opacity: layer.options.opacity,
      fillOpacity: layer.options.fillOpacity
    };
  }

  function restoreSelectedTreeMarker() {
    if (!selectedTreeMarker || !selectedTreeOriginalStyle || !selectedTreeMarker.setStyle) {
      return;
    }
    selectedTreeMarker.setStyle({
      fillColor: selectedTreeOriginalStyle.fillColor,
      color: selectedTreeOriginalStyle.color,
      weight: selectedTreeOriginalStyle.weight,
      opacity: selectedTreeOriginalStyle.opacity,
      fillOpacity: selectedTreeOriginalStyle.fillOpacity
    });
    if (selectedTreeOriginalStyle.radius !== undefined && selectedTreeMarker.setRadius) {
      selectedTreeMarker.setRadius(selectedTreeOriginalStyle.radius);
    }
  }

  function setSelectedTreeMarker(layer) {
    if (!layer || !layer.setStyle) {
      return;
    }
    if (selectedTreeMarker === layer) {
      return;
    }
    restoreSelectedTreeMarker();
    selectedTreeMarker = layer;
    selectedTreeOriginalStyle = getMarkerStyleSnapshot(layer);
    layer.setStyle({
      fillColor: "#d8a2ad",
      color: "#7c2942",
      weight: 2,
      opacity: 1,
      fillOpacity: 1
    });
    if (layer.setRadius) {
      layer.setRadius(8);
    }
  }

  function clearSearchHighlights() {
    if (searchHighlightLayer) {
      map.removeLayer(searchHighlightLayer);
      searchHighlightLayer = null;
    }
  }

  function clearSearchHover() {
    if (searchHoverLayer) {
      map.removeLayer(searchHoverLayer);
      searchHoverLayer = null;
    }
  }

  function setLocationStatus(message, kind) {
    var el = document.getElementById("location-status");
    if (!el) return;
    el.className = "location-status";
    if (kind) {
      el.className += " location-status-" + kind;
    }
    el.textContent = message;
  }

  function updateLocationButtons(isTracking) {
    var startBtn = document.getElementById("locate-start");
    var centerBtn = document.getElementById("locate-center");
    var stopBtn = document.getElementById("locate-stop");
    if (startBtn) {
      startBtn.disabled = isTracking;
    }
    if (centerBtn) {
      centerBtn.disabled = !lastAcceptedPosition;
    }
    if (stopBtn) {
      stopBtn.disabled = !isTracking;
    }
  }

  function centerMapOnUser() {
    if (!lastAcceptedPosition || !lastAcceptedPosition.latlng) {
      setLocationStatus("Location not available yet. Start tracking first.", "muted");
      updateLocationButtons(locationWatchId !== null);
      return;
    }
    map.setView(lastAcceptedPosition.latlng, Math.max(map.getZoom(), 17));
    setLocationStatus("Map centered on your latest location.", "info");
  }

  function updateUserLocation(latlng, accuracyMeters) {
    if (!latlng) return;
    if (!userLocationLayer) {
      userLocationLayer = L.layerGroup();
      map.addLayer(userLocationLayer);
    }
    userLocationLayer.clearLayers();

    var accuracy = typeof accuracyMeters === "number" && accuracyMeters > 0 ? accuracyMeters : 0;
    if (accuracy > 0) {
      var accuracyCircle = L.circle(latlng, {
        radius: accuracy,
        color: "#2563eb",
        weight: 1,
        opacity: 0.55,
        fillColor: "#60a5fa",
        fillOpacity: 0.18
      });
      userLocationLayer.addLayer(accuracyCircle);
    }

    var userMarker = L.circleMarker(latlng, {
      radius: 7,
      color: "#ffffff",
      weight: 2,
      fillColor: "#2563eb",
      fillOpacity: 1,
      className: "user-location-marker"
    });
    userLocationLayer.addLayer(userMarker);

    if (!hasCenteredOnUser) {
      hasCenteredOnUser = true;
      map.setView(latlng, Math.max(map.getZoom(), 17));
    }
    updateLocationButtons(locationWatchId !== null);
  }

  function stopLocationTracking(clearVisual, preserveStatus) {
    if (locationWatchId !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(locationWatchId);
      locationWatchId = null;
    }
    updateLocationButtons(false);
    if (clearVisual && userLocationLayer) {
      map.removeLayer(userLocationLayer);
      userLocationLayer = null;
      hasCenteredOnUser = false;
      lastAcceptedPosition = null;
    }
    if (!preserveStatus) {
      if (clearVisual) {
        setLocationStatus("Location tracking is off.", "muted");
      } else {
        setLocationStatus("Tracking paused. The map will stay put until you start again.", "muted");
      }
    }
  }

  function startLocationTracking() {
    if (!navigator.geolocation) {
      setLocationStatus("Location not supported by this browser.", "error");
      updateLocationButtons(false);
      return;
    }
    if (locationWatchId !== null) {
      return;
    }

    hasCenteredOnUser = false;
    lastAcceptedPosition = null;
    setLocationStatus("Requesting location permission...", "info");
    updateLocationButtons(true);

    function handlePosition(pos) {
      var timestampMs = typeof pos.timestamp === "number" ? pos.timestamp : Date.now();
      var ageMs = Date.now() - timestampMs;
        var latlng = [pos.coords.latitude, pos.coords.longitude];
        var accuracy = typeof pos.coords.accuracy === "number" && pos.coords.accuracy > 0 ? pos.coords.accuracy : 0;
        if (ageMs > MAX_POSITION_AGE_MS && lastAcceptedPosition) {
          setLocationStatus("Tracking your location. Latest update may be slightly delayed.", "info");
          return;
        }
      if (lastAcceptedPosition) {
        var previousLatLng = L.latLng(lastAcceptedPosition.latlng[0], lastAcceptedPosition.latlng[1]);
        var currentLatLng = L.latLng(latlng[0], latlng[1]);
        var movedMeters = previousLatLng.distanceTo(currentLatLng);
        var accuracyWorseBy = accuracy - lastAcceptedPosition.accuracy;
        if (accuracyWorseBy > MAX_WORSE_ACCURACY_JUMP_METERS && movedMeters < accuracyWorseBy * 0.5) {
          setLocationStatus("Discarding low-confidence location update; waiting for a better fix...", "info");
          return;
        }
      }
      lastAcceptedPosition = {
        latlng: latlng,
        accuracy: accuracy,
        timestamp: timestampMs
      };
      updateUserLocation(latlng, accuracy);
      if (ageMs > MAX_POSITION_AGE_MS) {
        setLocationStatus("Showing the browser's last known location; waiting for a fresher update.", "info");
      } else {
        setLocationStatus("Tracking your location live.", "info");
      }
    }

    locationWatchId = navigator.geolocation.watchPosition(
      handlePosition,
      function (err) {
        var msg = "Unable to get your location.";
        if (err && err.code === 1) {
          msg = "Location permission denied. Please allow access and try again.";
        } else if (err && err.code === 2) {
          msg = "Location unavailable in this browser. Try Safari or Chrome.";
        } else if (err && err.code === 3) {
          msg = "Location request timed out. Try Safari or Chrome if this keeps happening.";
        }
        setLocationStatus(msg, "error");
        stopLocationTracking(false, true);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 15000
      }
    );

    navigator.geolocation.getCurrentPosition(
      handlePosition,
      function () {},
      {
        enableHighAccuracy: true,
        maximumAge: 600000,
        timeout: 8000
      }
    );
  }

  function wireLocationControls() {
    var startBtn = document.getElementById("locate-start");
    var centerBtn = document.getElementById("locate-center");
    var stopBtn = document.getElementById("locate-stop");
    if (!startBtn || !centerBtn || !stopBtn) {
      return;
    }
    startBtn.onclick = function () {
      startLocationTracking();
    };
    centerBtn.onclick = function () {
      centerMapOnUser();
    };
    stopBtn.onclick = function () {
      stopLocationTracking(false);
    };
    updateLocationButtons(false);
    setLocationStatus("Location tracking is off.", "muted");
  }

  function wireRefreshCacheControl() {
    var btn = document.getElementById("refresh-cache");
    if (!btn) {
      return;
    }
    btn.onclick = function () {
      var progress = document.getElementById("refresh-progress");
      btn.disabled = true;
      btn.className += " is-busy";
      btn.textContent = "Refreshing...";
      if (progress) {
        progress.className = "refresh-progress is-visible";
        progress.setAttribute("aria-hidden", "false");
      }
      var search = window.location.search || "";
      var params = [];
      var pairs = search.length > 1 ? search.substring(1).split("&") : [];
      for (var i = 0; i < pairs.length; i++) {
        if (!pairs[i] || pairs[i].indexOf("_refresh=") === 0) {
          continue;
        }
        params.push(pairs[i]);
      }
      params.push("_refresh=" + encodeURIComponent(String(Date.now())));
      setTimeout(function () {
        window.location.replace(window.location.pathname + "?" + params.join("&") + window.location.hash);
      }, 700);
    };
  }

  function wireMapViewControls() {
    var expandBtn = document.getElementById("map-expand");
    var collapseBtn = document.getElementById("map-collapse");
    if (!expandBtn || !collapseBtn) {
      return;
    }

    function refreshMapSize() {
      setTimeout(function () {
        map.invalidateSize();
      }, 80);
    }

    function setExpanded(isExpanded) {
      var className = document.body.className || "";
      if (isExpanded) {
        if (className.indexOf("map-expanded") === -1) {
          document.body.className = (className + " map-expanded").replace(/^\s+/, "");
        }
        expandBtn.setAttribute("aria-expanded", "true");
        collapseBtn.focus();
      } else {
        document.body.className = className.replace(/\bmap-expanded\b/g, "").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
        expandBtn.setAttribute("aria-expanded", "false");
        expandBtn.focus();
      }
      refreshMapSize();
    }

    expandBtn.onclick = function () {
      setExpanded(true);
    };
    collapseBtn.onclick = function () {
      setExpanded(false);
    };
    document.addEventListener("keydown", function (e) {
      if (e.keyCode === 27 && (document.body.className || "").indexOf("map-expanded") !== -1) {
        setExpanded(false);
      }
    });
  }

  function isSourceVisible(source) {
    if (source === "cherries") {
      return !!(cherriesLayer && map.hasLayer(cherriesLayer));
    }
    if (source === "other") {
      return !!(otherLayer && map.hasLayer(otherLayer));
    }
    return false;
  }

  function renderSearchHighlights(results, fitToResults) {
    clearSearchHighlights();
    var highlightable = [];
    for (var i = 0; i < results.length; i++) {
      var item = results[i];
      if (!item || !item.latlng || !isSourceVisible(item.source)) {
        continue;
      }
      highlightable.push(item);
    }
    if (!highlightable.length) {
      return { highlightedCount: 0, visibleCount: 0, totalCount: results.length, capped: false };
    }

    var capped = highlightable.length > MAX_HIGHLIGHT_MARKERS;
    var highlighted = capped ? highlightable.slice(0, MAX_HIGHLIGHT_MARKERS) : highlightable;
    searchHighlightLayer = L.layerGroup();
    var bounds = L.latLngBounds();
    for (var j = 0; j < highlighted.length; j++) {
      var match = highlighted[j];
      // Keep overlay highlights non-interactive so clicks reach tree markers/popups underneath.
      var marker = L.circleMarker(match.latlng, {
        className: "search-highlight-marker",
        radius: 9,
        fillColor: "#7c2942",
        color: "#ffffff",
        weight: 2,
        opacity: 1,
        fillOpacity: 0.9,
        interactive: false,
        bubblingMouseEvents: false
      });
      searchHighlightLayer.addLayer(marker);
      bounds.extend(match.latlng);
    }
    map.addLayer(searchHighlightLayer);

    if (fitToResults && highlighted.length > 1 && bounds.isValid()) {
      map.fitBounds(bounds.pad(0.12));
    }
    return {
      highlightedCount: highlighted.length,
      visibleCount: highlightable.length,
      totalCount: results.length,
      capped: capped
    };
  }

  function refreshSearchHighlights() {
    if (!currentSearchQuery) {
      clearSearchHighlights();
      clearSearchHover();
      return;
    }
    var container = document.getElementById("search-results");
    if (container && container.style.display === "block") {
      showSearchResults(currentSearchResults, false);
      return;
    }
    renderSearchHighlights(currentSearchResults, false);
  }

  function highlightHoveredResult(item) {
    clearSearchHover();
    if (!item || !item.latlng || !isSourceVisible(item.source)) {
      return;
    }
    // Hover ring is visual-only; it must not capture click/touch events.
    var marker = L.circleMarker(item.latlng, {
      radius: 11,
      fillColor: "#d8a2ad",
      color: "#ffffff",
      weight: 3,
      opacity: 1,
      fillOpacity: 0.95,
      className: "search-hover-marker",
      interactive: false,
      bubblingMouseEvents: false
    });
    searchHoverLayer = L.layerGroup([marker]);
    map.addLayer(searchHoverLayer);
  }

  function searchTrees(query) {
    if (!query || !query.trim()) {
      return [];
    }
    var q = query.trim().toLowerCase();
    var results = [];
    for (var i = 0; i < allFeatures.length; i++) {
      var item = allFeatures[i];
      var p = item.props;
      var tagMatch = p.tag !== undefined && String(p.tag).toLowerCase() === q;
      var textMatch = false;
      if (!tagMatch) {
        var searchable = [
          p.species || "",
          p.latin_name || "",
          p.tag !== undefined ? String(p.tag) : "",
          p.square || "",
          p.comments || "",
          p.memorial_commemorative || ""
        ].join(" ").toLowerCase();
        textMatch = searchable.indexOf(q) !== -1;
      }
      if (tagMatch || textMatch) {
        results.push({ item: item, tagMatch: tagMatch });
      }
    }
    results.sort(function (a, b) {
      if (a.tagMatch && !b.tagMatch) return -1;
      if (!a.tagMatch && b.tagMatch) return 1;
      return 0;
    });
    return results.map(function (r) { return r.item; });
  }

  function showSearchResults(results, fitToResults) {
    var container = document.getElementById("search-results");
    if (!container) return;
    container.innerHTML = "";
    currentSearchResults = results.slice(0);
    if (results.length === 0) {
      searchListExpanded = false;
      activeSearchIndex = -1;
      container.innerHTML = '<div class="search-no-results">No matches found</div>';
      container.style.display = "block";
      setSearchExpanded(true);
      clearSearchHighlights();
      clearSearchHover();
      return;
    }
    var highlightInfo = renderSearchHighlights(results, fitToResults);
    var summary = document.createElement("div");
    summary.className = "search-results-summary";
    var status = document.createElement("div");
    status.className = "search-results-status";
    if (highlightInfo.totalCount === 0) {
      status.textContent = "No matches found";
    } else if (highlightInfo.visibleCount === 0) {
      status.textContent = "0 of " + highlightInfo.totalCount + " matches highlighted (visible layers only)";
    } else if (highlightInfo.visibleCount === highlightInfo.totalCount && !highlightInfo.capped) {
      status.textContent = highlightInfo.highlightedCount + " matches highlighted on map";
    } else {
      var reasons = [];
      if (highlightInfo.visibleCount < highlightInfo.totalCount) {
        reasons.push("visible layers only");
      }
      if (highlightInfo.capped) {
        reasons.push("capped for performance");
      }
      var suffix = reasons.length ? " (" + reasons.join(", ") + ")" : "";
      status.textContent = highlightInfo.highlightedCount + " of " + highlightInfo.totalCount + " matches highlighted" + suffix;
    }
    summary.appendChild(status);
    var toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "search-results-toggle";
    toggle.textContent = searchListExpanded ? "Hide list" : "View list";
    summary.appendChild(toggle);
    container.appendChild(summary);

    if (searchListExpanded) {
      var listItems = results.length > MAX_LIST_ITEMS ? results.slice(0, MAX_LIST_ITEMS) : results;
      for (var i = 0; i < listItems.length; i++) {
        var item = listItems[i];
        var p = item.props;
        var div = document.createElement("button");
        div.className = "search-result-item";
        div.type = "button";
        div.setAttribute("role", "option");
        div.setAttribute("aria-selected", "false");
        div.id = "search-result-" + i;
        var name = "Unknown";
        if (p.species && p.latin_name) {
          name = p.species + ", " + p.latin_name;
        } else if (p.species) {
          name = p.species;
        } else if (p.latin_name) {
          name = p.latin_name;
        }
        var label = (p.tag ? "[" + p.tag + "] " : "") + name;
        if (p.square) {
          label += " (" + p.square + ")";
        }
        div.textContent = label;
        div.setAttribute("data-index", String(i));
        container.appendChild(div);
      }
      if (results.length > listItems.length) {
        var listLimitNote = document.createElement("div");
        listLimitNote.className = "search-no-results";
        listLimitNote.textContent =
          "Showing first " + listItems.length + " results in list for performance.";
        container.appendChild(listLimitNote);
      }
    }

    container.style.display = "block";
    setSearchExpanded(true);
    container.onclick = function (e) {
      var rawTarget = e.target;
      var target = rawTarget && rawTarget.nodeType === 3 ? rawTarget.parentNode : rawTarget;
      var targetClass = target && target.className ? String(target.className) : "";
      if (targetClass.indexOf("search-results-toggle") !== -1) {
        if (e.preventDefault) e.preventDefault();
        if (e.stopPropagation) e.stopPropagation();
        searchListExpanded = !searchListExpanded;
        showSearchResults(currentSearchResults, false);
        return;
      }
      if (targetClass.indexOf("search-result-item") === -1) return;
      var idx = parseInt(target.getAttribute("data-index"), 10);
      if (isNaN(idx) || !results[idx]) return;
      var item = results[idx];
      zoomToFeature(item);
      container.style.display = "none";
      setSearchExpanded(false);
      document.getElementById("search-input").value = "";
      currentSearchQuery = "";
      currentSearchResults = [];
      searchListExpanded = false;
      activeSearchIndex = -1;
      clearSearchHighlights();
      clearSearchHover();
    };
    container.onmouseover = function (e) {
      var rawTarget = e.target;
      var target = rawTarget && rawTarget.nodeType === 3 ? rawTarget.parentNode : rawTarget;
      var targetClass = target && target.className ? String(target.className) : "";
      if (targetClass.indexOf("search-result-item") === -1) return;
      var idx = parseInt(target.getAttribute("data-index"), 10);
      if (isNaN(idx) || !results[idx]) return;
      highlightHoveredResult(results[idx]);
    };
    container.onmouseout = function (e) {
      var rawTarget = e.target;
      var target = rawTarget && rawTarget.nodeType === 3 ? rawTarget.parentNode : rawTarget;
      var targetClass = target && target.className ? String(target.className) : "";
      if (targetClass.indexOf("search-result-item") === -1) return;
      var rel = e.relatedTarget;
      var relNode = rel && rel.nodeType === 3 ? rel.parentNode : rel;
      if (relNode && relNode.className && String(relNode.className).indexOf("search-result-item") !== -1) {
        return;
      }
      clearSearchHover();
    };
  }

  function zoomToFeature(item) {
    var layerGroup = null;
    var layerRef = null;
    if (item.source === "cherries") {
      layerGroup = cherriesLayer;
      layerRef = cherriesLayerRef;
      ensureLayerVisible("layer-cherries", cherriesLayer);
    } else if (item.source === "other") {
      layerGroup = otherLayer;
      layerRef = otherLayerRef;
      ensureLayerVisible("layer-other", otherLayer);
    }
    if (!layerGroup || !layerRef) return;
    var list = layerRef.list;
    for (var i = 0; i < list.length; i++) {
      var lyr = list[i];
      var f = lyr.feature;
      if (f && f.properties && f.properties.tag === item.props.tag) {
        setSelectedTreeMarker(lyr);
        var ll = lyr.getLatLng ? lyr.getLatLng() : null;
        if (ll) {
          map.setView(ll, Math.max(map.getZoom(), 17));
        }
        lyr.openPopup();
        return;
      }
    }
  }

  function ensureLayerVisible(checkboxId, layer) {
    if (!layer) return;
    var cb = document.getElementById(checkboxId);
    if (cb && !cb.checked) {
      cb.checked = true;
      map.addLayer(layer);
    } else if (!map.hasLayer(layer)) {
      map.addLayer(layer);
    }
    updateLabelsVisibility();
  }

  function initSearch() {
    var input = document.getElementById("search-input");
    var results = document.getElementById("search-results");
    if (!input) return;
    var debounce = null;
    input.oninput = function () {
      clearTimeout(debounce);
      debounce = setTimeout(function () {
        var q = input.value;
        var trimmed = q.trim();
        if (!trimmed) {
          results.style.display = "none";
          setSearchExpanded(false);
          results.innerHTML = "";
          currentSearchQuery = "";
          currentSearchResults = [];
          searchListExpanded = false;
          activeSearchIndex = -1;
          clearSearchHighlights();
          clearSearchHover();
          return;
        }
        var fitToResults = currentSearchQuery !== trimmed.toLowerCase();
        currentSearchQuery = trimmed.toLowerCase();
        var found = searchTrees(q);
        searchListExpanded = found.length > 0 && found.length <= 12;
        activeSearchIndex = -1;
        showSearchResults(found, fitToResults);
      }, 150);
    };
    input.onkeydown = function (e) {
      if (e.keyCode === 27) {
        results.style.display = "none";
        setSearchExpanded(false);
        input.value = "";
        currentSearchQuery = "";
        currentSearchResults = [];
        searchListExpanded = false;
        activeSearchIndex = -1;
        clearSearchHighlights();
        clearSearchHover();
      } else if (e.keyCode === 40) {
        if (results.style.display === "block") {
          if (e.preventDefault) e.preventDefault();
          setActiveSearchIndex(activeSearchIndex + 1);
        }
      } else if (e.keyCode === 38) {
        if (results.style.display === "block") {
          if (e.preventDefault) e.preventDefault();
          setActiveSearchIndex(activeSearchIndex <= 0 ? 0 : activeSearchIndex - 1);
        }
      } else if (e.keyCode === 13 && currentSearchResults.length === 1) {
        if (e.preventDefault) e.preventDefault();
        zoomToFeature(currentSearchResults[0]);
        results.style.display = "none";
        setSearchExpanded(false);
        input.value = "";
        currentSearchQuery = "";
        currentSearchResults = [];
        searchListExpanded = false;
        activeSearchIndex = -1;
        clearSearchHighlights();
        clearSearchHover();
      }
    };
    results.onkeydown = function (e) {
      var items = results.querySelectorAll(".search-result-item");
      if (!items.length) return;
      if (e.keyCode === 40) {
        if (e.preventDefault) e.preventDefault();
        setActiveSearchIndex(activeSearchIndex >= items.length - 1 ? items.length - 1 : activeSearchIndex + 1);
      } else if (e.keyCode === 38) {
        if (e.preventDefault) e.preventDefault();
        setActiveSearchIndex(activeSearchIndex <= 0 ? 0 : activeSearchIndex - 1);
      } else if (e.keyCode === 27) {
        results.style.display = "none";
        setSearchExpanded(false);
        input.focus();
      }
    };
    document.addEventListener("click", function (e) {
      if (!results.contains(e.target) && e.target !== input) {
        results.style.display = "none";
        setSearchExpanded(false);
        searchListExpanded = false;
        activeSearchIndex = -1;
        clearSearchHover();
        if (!currentSearchQuery) {
          currentSearchResults = [];
          clearSearchHighlights();
        }
      }
    });
  }

  var params = getQueryParams();
  var pendingTag = params.tag ? String(params.tag).trim() : "";
  var pendingSquare = params.square ? String(params.square).trim().toLowerCase() : "";

  function setCount(id, n) {
    var el = document.getElementById(id);
    if (el) {
      el.textContent = String(n);
    }
  }

  function wireCheckbox(id, layer) {
    var cb = document.getElementById(id);
    if (!cb || !layer) {
      return;
    }
    cb.onchange = function () {
      if (cb.checked) {
        map.addLayer(layer);
      } else {
        map.removeLayer(layer);
      }
    };
  }

  function fitToCherries() {
    if (!cherriesLayer) {
      return;
    }
    var b = cherriesLayer.getBounds();
    if (b && b.isValid()) {
      map.fitBounds(b.pad(0.08));
    }
  }

  function findAndOpenPopup(layerGroup, layerRef, matchFn) {
    if (!layerGroup || !map.hasLayer(layerGroup)) {
      return false;
    }
    var list = layerRef.list;
    for (var i = 0; i < list.length; i++) {
      var lyr = list[i];
      var f = lyr.feature;
      if (f && f.properties && matchFn(f.properties)) {
        setSelectedTreeMarker(lyr);
        var ll = lyr.getLatLng ? lyr.getLatLng() : null;
        if (ll) {
          map.setView(ll, Math.max(map.getZoom(), 17));
        }
        lyr.openPopup();
        return true;
      }
    }
    return false;
  }

  function applyDeepLink() {
    var found = false;
    if (!cherriesLayer) {
      return;
    }
    var cbCherries = document.getElementById("layer-cherries");
    if (pendingTag) {
      if (cbCherries) {
        cbCherries.checked = true;
      }
      map.addLayer(cherriesLayer);
      found = findAndOpenPopup(cherriesLayer, cherriesLayerRef, function (p) {
        return String(p.tag) === pendingTag;
      });
      if (!found && otherLayer) {
        var cbOther = document.getElementById("layer-other");
        if (cbOther) {
          cbOther.checked = true;
        }
        map.addLayer(otherLayer);
        found = findAndOpenPopup(otherLayer, otherLayerRef, function (p) {
          return String(p.tag) === pendingTag;
        });
      }
      if (found) {
        setNotice("Showing tree tag " + pendingTag + ".", "info");
      } else {
        setNotice("No tree found for tag " + pendingTag + ". Check the tag number or try search.", "warning");
      }
      return;
    }
    if (pendingSquare) {
      if (cbCherries) {
        cbCherries.checked = true;
      }
      map.addLayer(cherriesLayer);
      found = findAndOpenPopup(cherriesLayer, cherriesLayerRef, function (p) {
        return p.square && String(p.square).toLowerCase() === pendingSquare;
      });
      if (found) {
        setNotice("Showing the first cherry found in square " + pendingSquare.toUpperCase() + ".", "info");
      } else {
        setNotice("No cherry found for square " + pendingSquare.toUpperCase() + ". Check the square reference or try search.", "warning");
      }
    }
  }

  var pending = 2;
  function checkDone() {
    pending -= 1;
    if (pending > 0) {
      return;
    }
    fitToCherries();
    applyDeepLink();
    if (loadErrors.length) {
      setNotice("Some tree data could not be loaded. The map may be incomplete.", "error");
    } else if (!pendingTag && !pendingSquare) {
      var elapsed = Date.now() - dataLoadStartedAt;
      var remaining = Math.max(0, MIN_LOADING_NOTICE_MS - elapsed);
      setTimeout(function () {
        setNotice("");
      }, remaining);
    }
  }

  function wireLayerCheckbox(id, layer, labels) {
    var cb = document.getElementById(id);
    if (!cb || !layer) return;
    cb.onchange = function () {
      if (cb.checked) {
        map.addLayer(layer);
      } else {
        map.removeLayer(layer);
      }
      updateLabelsVisibility();
      refreshSearchHighlights();
    };
  }

  function wireLabelsToggle() {
    var cb = document.getElementById("toggle-labels");
    if (!cb) return;
    cb.onchange = function () {
      labelsVisible = cb.checked;
      updateLabelsVisibility();
    };
  }

  function registerFeatures(data, source) {
    var features = data.features || [];
    for (var i = 0; i < features.length; i++) {
      var f = features[i];
      if (f.properties) {
        var latlng = null;
        if (f.geometry && f.geometry.type === "Point" && f.geometry.coordinates && f.geometry.coordinates.length >= 2) {
          latlng = [f.geometry.coordinates[1], f.geometry.coordinates[0]];
        }
        allFeatures.push({ props: f.properties, source: source, latlng: latlng });
      }
    }
  }

  dataLoadStartedAt = Date.now();
  setNotice("Loading tree data...", "info");

  loadGeoJSON("data/cherries.geojson", function (err, data) {
    if (err) {
      loadErrors.push("cherries");
      setCount("count-cherries", "0");
      checkDone();
      return;
    }
    cherriesLayer = buildLayer(
      data,
      { radius: 6, fillColor: "#b84f67", color: "#7c2942", weight: 1, opacity: 0.92, fillOpacity: 0.86 },
      cherriesLayerRef
    );
    cherriesLabels = buildLabelsLayer(data, "label-cherry");
    registerFeatures(data, "cherries");
    setCount("count-cherries", data.features ? data.features.length : 0);
    map.addLayer(cherriesLayer);
    wireLayerCheckbox("layer-cherries", cherriesLayer, cherriesLabels);
    checkDone();
  });

  loadGeoJSON("data/other_trees.geojson", function (err, data) {
    if (err) {
      loadErrors.push("other trees");
      setCount("count-other", "0");
      checkDone();
      return;
    }
    otherLayer = buildLayer(
      data,
      { radius: 4, fillColor: "#2f6b4f", color: "#173f2e", weight: 1, opacity: 0.78, fillOpacity: 0.66 },
      otherLayerRef
    );
    otherLabels = buildLabelsLayer(data, "label-other");
    registerFeatures(data, "other");
    setCount("count-other", data.features ? data.features.length : 0);
    wireLayerCheckbox("layer-other", otherLayer, otherLabels);
    checkDone();
  });

  wireLabelsToggle();
  initSearch();
  wireLocationControls();
  wireRefreshCacheControl();
  wireMapViewControls();
})();
