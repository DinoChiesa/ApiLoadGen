var usergrid=require('usergrid');
var client = new usergrid.client({
    orgName:'mukundha',
    appName:'testdata',
    URI:'https://api.usergrid.com',
    logging: true, //optional - turn on logging, off by default
    buildCurl: true //optional - turn on curl commands, off by default
});

var ip = geoToRandomIp('BOSTON');
console.log(ip);

function geoToRandomIp(city) {
	var options = {method:'GET', endpoint:'cities' , qs: {ql:'select * where city=\'' + city + '\'' }};
	client.request(options,function(e,res){
		console.log(JSON.stringify(res));
		var i;
		if ( res.entities && res.entities[0]){
			var res = res.entities[0];
			var ranges = res.ranges ;
			var noOfRanges = res.ranges.length;

			var selectedRange = res.ranges[Math.floor(Math.random() * noOfRanges)];
			var start = parseInt(selectedRange[0]);
			var end = parseInt(selectedRange[1]);

			var index=Math.floor(Math.random()*(start-end));
	  		var selected = start + index;
	  		
	  		var w =  Math.floor(( selected / 16777216 ) % 256);
			var x =  Math.floor(( selected / 65536    ) % 256);
			var y =  Math.floor(( selected / 256      ) % 256);
			var z =  Math.floor(( selected            ) % 256);

			var ip = w + "." + x + "." + y + "." + z ;
			console.log(ip);
			return ip;
		}
		else{
			console.log('city not found');
			return '';
		}
	});
}
