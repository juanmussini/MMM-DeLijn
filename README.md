# MMM-DeLijn

This is a module for the Magic Mirror. It loads live timings for a specific bus stop. Each bus is shown as `7m 250 14⏱️`: minutes until the bus arrives, the public line number (e.g. R50), and the travel time to `destinationStop` (if set).

![MMM-DeLijn](MMM-DeLijn.jpg "MMM-DeLijn")

## Installation

Go to [this page](https://data.delijn.be/) and make an account. Then subscribe to the "Open Data Free" product. You will get an API key.

Look up your bus stop number (haltenummer) using [this website](https://www.delijn.be/en/haltes/). The entity number (entiteitnummer) is the region: 1 Antwerpen, 2 Oost-Vlaanderen, 3 Vlaams-Brabant, 4 Limburg, 5 West-Vlaanderen. It usually matches the first digit of the stop number.

You can check both with curl before configuring the mirror:
```
curl -i -H "Ocp-Apim-Subscription-Key: YOUR_KEY" "https://api.delijn.be/DLKernOpenData/api/v1/haltes/3/300881/real-time"
```

Clone this repository into your MagicMirror modules folder:
```
cd ~/MagicMirror/modules
git clone https://github.com/juanmussini/MMM-DeLijn.git
```

add this to your config file:
```
{
    module: "MMM-DeLijn",
    header: "Bus",
    config: {
        entity: 3,
        busStop: "300881",
        apiKey: "YOUR_KEY",
        destination: "Brussel Noord", // optional: only buses whose destination contains this text
        direction: "TERUG",           // optional: only "HEEN" or "TERUG" buses
        results: 3,                   // optional: number of buses to show
        destinationStop: "123456"     // optional: stop number where you get off, to show the travel time
    }
}
```
