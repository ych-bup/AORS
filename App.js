import React, { useState, useEffect, Component } from 'react';
import MapView, { Marker, Circle } from 'react-native-maps';
import { StyleSheet, View, Text, SafeAreaView, TouchableOpacity, Image } from 'react-native';
import { Moon } from 'lunarphase-js';
import * as Location from 'expo-location';
import { GoogleSpreadsheet, GoogleSpreadsheetRow } from "google-spreadsheet";
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as cred from './cred.json';
import * as api from './api.json';

export default function App() {
  const [msg, setMsg] = useState('없음');
  const [rt, setRT] = useState('-');
  const [locMsg, setLocMsg] = useState('-');
  const [temperature, setTemperature] = useState('-');
  const [cldMsg, setCldMsg] = useState('-');
  const [region, setRegion] = useState({ latitude: 37, longitude: 127 });
  const [markers, setMarkers] = useState([]);
  const [weather, setWeather] = useState([]);
  const [currentLumen, setCurrentLumen] = useState([]);
  const [windMsg, setWindMsg] = useState('-');
  const [presMsg, setPresMsg] = useState('-');
  const [humiMsg, setHumiMsg] = useState('-');
  const [descMsg, setDescMsg] = useState('-');
  const [rdate, setRdate] = useState('-');
  const APP_ID = api.APP_ID;
  const T = 86400000;
  const THRESHOLD = 0.65;
  const isEmpty = (arr) => {
    return Object.keys(arr).length == 0;
  };
  const readFirstSheetRow = async (doc) => {
    var sheet = doc.sheetBy[0]; // 첫번째 시티를 가져옵니다.
    var rows = await sheet.getRows({ offset: 4, limit: 100 }); // 세 번째 row 부터 100개 row를 가져옵니다.
    rows.forEach((ele) => {
      console.log(ele._rawData[0], ele._rawData[1]) // 읽어온 rows 중 현재row에서 첫 번째 컬럼과 두 번째 컬럼을 출력합니다.
    });
  }
  const getGoogleSheet = async () => {
    const doc = new GoogleSpreadsheet(api.SHEET, cred);
    // 구글 인증이 필요하다
    doc.auth.apiKey = api.API_KEY;
    //console.log(api.API_KEY)
    await doc.loadInfo();
    return doc;
  }
  const jsonToWeather = (json, n) => {
    const current = json.current;
    const daily = json.daily[n];
    const sunrise = new Date(current.sunrise * 1000);
    const sunset = new Date(current.sunset * 1000);
    const moonrise = new Date(daily.moonrise * 1000);
    const moonset = new Date(daily.moonset * 1000);
    const startTime = new Date();
    startTime.setHours(0, 0, 0, 0);
    // setMsg(json);
    return {
      temp: current.temp - 273.15,
      humidity: current.humidity,
      clouds: 1 - current.clouds / 100,
      visibility: current.visibility / 1000,
      moonPhase: daily.moon_phase,
      pressure: current.pressure,
      windspeed: parseFloat(current.wind_speed).toFixed(2),
      time: new Date(current.dt * 1000),
      sunrise,
      sunset,
      moonrise,
      moonset,
      startTime,
      description: current.weather[0].description,
    };
  };

  const rgbToHex = (r, g, b) => {
    let rgb = [r, g, b];
    rgb = rgb.map((x) => {
      let str = x.toString(16);
      if (str.length === 1) str = "0" + str;
      return str;
    });
    return "#" + rgb.join("");
  }
  //시간대에 따른 태양의 빛 방사량 수치화
  const getBonus = (weather) => { //cos그래프 y축 이동(낮 시간 조절)
    return (
      ((weather.sunset.getTime() - weather.sunrise.getTime()) / T - 0.5) * 3
    );
  };
  const dayCycle = (current_time, weather) => { //cos함수
    const middleTime = new Date(
      (weather.sunrise.getTime() + weather.sunset.getTime()) / 2
    );
    const x = (middleTime.getMinutes() * 60 + middleTime.getSeconds()) * 1000;
    //console.log(x);
    const result = Math.cos(((current_time - x) / T) * Math.PI * 2);
    return result - getBonus(weather);
  };
  const dt_to_daysecond = (date) => {
    return (
      ((date.getHours() * 60 + date.getMinutes()) * 60 + date.getSeconds()) *
      1000
    );
  };
  const callWeather = async (location) => {
    const url = `http://api.openweathermap.org/data/3.0/onecall?lat=${location.latitude}&lon=${location.longitude}&appid=${APP_ID}&exclude=minutely,alert`;
    await fetch(url)
      .then((res) => {
        return res.json();
      })
      .then((json) => {
        // setMsg(json);
        const weatherCurrent = jsonToWeather(json, 0);
        const weatherNext = jsonToWeather(json, 1);

        let maxLumenCT = 0;
        let maxLumen = 0;

        let nowLumen = dayCycle((new Date()).getTime(), weatherCurrent);
        if (
          weatherCurrent.moonrise.getTime() < (new Date()).getTime() &&
          weatherNext.moonset.getTime() > (new Date()).getTime()
        ) {
          nowLumen -= weatherCurrent.moonPhase;
        }
        nowLumen *= weatherCurrent.clouds;
        const obs = [];
        //console.log(weatherCurrent.startTime.toLocaleTimeString());
        for (let ct = T / 2; ct < T + T / 2; ct += 60000) {
          let lumen = dayCycle(ct, weatherCurrent);
          const ctimestamp = ct + weatherCurrent.startTime.getTime();
          if (
            weatherCurrent.moonrise.getTime() < ctimestamp &&
            weatherNext.moonset.getTime() > ctimestamp
          ) {
            lumen -= weatherCurrent.moonPhase;
          }
          lumen *= weatherCurrent.clouds;
          if (lumen >= maxLumen) {
            maxLumen = lumen;
            maxLumenCT = ctimestamp;
          }
          if (lumen >= THRESHOLD) {
            obs.push(ctimestamp);
            //console.log(`Date: ${new Date(ctimestamp)}, lumen: ${lumen}`);
          }
        }
        setCurrentLumen(maxLumen);
        if (isEmpty(obs)) {
          setMsg(`관측 불가!\n최고점수: ${(maxLumen * 100).toFixed(1)} 현재 점수: ${(nowLumen * 100).toFixed(1)}`);
        }
        else {
          //setMsg(`complete : ${new Date(Math.min(...obs))} ${new Date(Math.max(...obs))}`);
          setMsg(`최상의 컨디션: ${(new Date(Math.max(maxLumenCT))).toLocaleTimeString()}\n현재 점수: ${(nowLumen * 100).toFixed(1)} 최고점수: ${(maxLumen * 100).toFixed(1)}`);
        }
        setWeather(weatherCurrent);
        setWindMsg(weatherCurrent.windspeed);
        setPresMsg(weatherCurrent.pressure);
        setHumiMsg(weatherCurrent.humidity);
        setCldMsg(((1 - weatherCurrent.clouds) * 100).toFixed(1));
        setTemperature(weatherCurrent.temp.toFixed(1));
        setDescMsg(weatherCurrent.description);
        console.log(weatherCurrent.description);
      });
  };

  const clickHandler = () => {
    const timerId = setInterval(() => {
      setRT(`${(new Date()).getHours()}:${(new Date()).getMinutes()}`);
      setRdate(`${(new Date()).toLocaleDateString()}`);
    }, 1000);

    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setMsg('Permission to access location was denied!');
        return;
      }
      setMsg('Getting location...');
      let location = await Location.getCurrentPositionAsync({});
      let coords = location.coords;
      let region = {
        latitude: coords.latitude,
        longitude: coords.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };

      setLocMsg(`Lat: ${region.latitude.toFixed(5)}\nLon: ${region.longitude.toFixed(5)}`);

      const doc = await getGoogleSheet();
      const place = doc.sheetsByTitle.place;
      await place.loadCells("A2:C");
      const sheet = await place.getRows();
      console.log(sheet[0]._rawData);
      setMsg('Getting weather data...');
      await callWeather(region);
      // setMsg('loading...');
      let markers = sheet.map(value => {
        const data = value._rawData;
        const lightPollution = parseFloat(data[3]);
        const red = parseInt(lightPollution / 200 * 255);
        const green = 255 - red;
        const rgb = rgbToHex(red, green, 0);
        const pos = { latitude: data[1], longitude: data[2], lightPollution: 200 - lightPollution, rgb };
        return pos;
      })

      setRegion(region);
      // setMarkers(markers.filter(val => (val.lightPollution / 10 * currentLumen) >= 8));
      setMarkers(markers);
    })();
    // return function cleanup() {
    //   clearInterval(timerId);
    // };
  };
  useEffect(() => clickHandler(), [])

  const locationLumen = async (location) => { //onSelect 함수
    console.log(`${location.latitude} / ${location.longitude}`);
    setLocMsg(`Lat: ${parseFloat(location.latitude).toFixed(5)}\nLon: ${parseFloat(location.longitude).toFixed(5)}`);
    const url = `http://api.openweathermap.org/data/3.0/onecall?lat=${location.latitude}&lon=${location.longitude}&appid=${APP_ID}&exclude=minutely,alert`;
    await fetch(url)
      .then((res) => {
        return res.json();
      })
      .then((json) => {
        // setMsg(json);
        const weatherCurrent = jsonToWeather(json, 0);
        const weatherNext = jsonToWeather(json, 1);
        let maxLumen = 0;
        let maxLumenCT = 0;

        let nowLumen = dayCycle((new Date()).getTime(), weatherCurrent);
        if (
          weatherCurrent.moonrise.getTime() < (new Date()).getTime() &&
          weatherNext.moonset.getTime() > (new Date()).getTime()
        ) {
          nowLumen -= weatherCurrent.moonPhase;
        }
        nowLumen *= weatherCurrent.clouds;
        setWindMsg(weatherCurrent.windspeed);
        setPresMsg(weatherCurrent.pressure);
        setHumiMsg(weatherCurrent.humidity);
        setCldMsg(((1 - weatherCurrent.clouds) * 100).toFixed(1));
        setTemperature(weatherCurrent.temp.toFixed(1));
        setDescMsg(weatherCurrent.description);
        console.log(weatherCurrent.description);
        console.log('온도' + weatherCurrent.temp);

        const obs = [];
        //console.log(weatherCurrent.startTime.toLocaleTimeString());
        for (let ct = T / 2; ct < T + T / 2; ct += 60000) {
          let lumen = dayCycle(ct, weatherCurrent);
          const ctimestamp = ct + weatherCurrent.startTime.getTime();
          if (
            weatherCurrent.moonrise.getTime() < ctimestamp &&
            weatherNext.moonset.getTime() > ctimestamp
          ) {
            lumen -= weatherCurrent.moonPhase;
          }
          lumen *= weatherCurrent.clouds;
          if (lumen >= maxLumen) {
            maxLumen = lumen;
            maxLumenCT = ctimestamp;
          }
          if (lumen >= THRESHOLD) {
            obs.push(ctimestamp);
            //console.log(`Date: ${new Date(ctimestamp)}, lumen: ${lumen}`);
          }
        }
        setCurrentLumen(maxLumen);
        if (isEmpty(obs)) {
          setMsg(`관측 불가!\n최고점수: ${(maxLumen * 100).toFixed(1)} 현재 점수: ${(nowLumen * 100).toFixed(1)}`);
        }
        else {
          setMsg(`최상의 컨디션: ${(new Date(Math.max(maxLumenCT))).toLocaleTimeString()}\n현재 점수: ${(nowLumen * 100).toFixed(1)} 최고점수: ${(maxLumen * 100).toFixed(1)}`);
        }
      });
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={{ color: '#FFF', fontSize: 35 }}>{`${Moon.lunarPhaseEmoji()}`}</Text>
          </View>
          <View style={styles.verticalLine}></View>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ color: '#FFF', fontSize: 13 }}>{`${rdate}`}</Text>
            <Text style={{ color: '#FFF', fontSize: 32 }}>{`${rt}`}</Text>
          </View>
          <View style={styles.verticalLine}></View>
          <View>
            <Text style={{ color: '#FFF' }}>
              {`월출 ${(new Date(weather?.moonrise)).getHours()}:${(new Date(weather?.moonrise)).getMinutes()}\n월몰 ${(new Date(weather?.moonset)).getHours()}:${(new Date(weather?.moonset)).getMinutes()}`}
            </Text>
          </View>
          <View style={styles.verticalLine}></View>
          <View>
            <Text style={{ color: '#FFF' }}>
              {`일출 ${(new Date(weather?.sunrise)).getHours()}:${(new Date(weather?.sunrise)).getMinutes()}\n일몰 ${(new Date(weather?.sunset)).getHours()}:${(new Date(weather?.sunset)).getMinutes()}`}
            </Text>
          </View>
        </View>
        <View style={styles.imageContainer}>
          <MapView style={styles.map} region={region}>
            <Marker coordinate={region} pinColor='#0000FF' onSelect={() => { locationLumen(region) }} />
            {markers.map((coords) => (
              <>
                <Marker onSelect={() => locationLumen(coords)} coordinate={coords} />
                <Circle
                  center={coords}
                  radius={20}
                  strokeWidth={2}
                  strokeColor={coords.rgb}
                  fillColor={coords.rgb + '9f'}
                />
              </>
            ))}
          </MapView>
        </View>
        <View style={styles.bottomText}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', borderBottomWidth: '1px', borderBottomColor: '#FFF', paddingHorizontal: '3%', paddingVertical: '2%' }}>
            <View>
              <Text style={{ color: '#FFF', fontSize: 45 }}>{`${temperature}°C`}</Text>
            </View>
            <View>
              <Text style={{ color: '#FFF', fontSize: 15 }}>{`${locMsg}`}</Text>
            </View>
          </View>
          <View style={{ width: '100%', paddingHorizontal: '3%', paddingVertical: '2%', flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: '1px', borderBottomColor: '#FFF' }}>
            <Text style={{ color: '#FFF' }}>{`Clouds: ${cldMsg}%\nNow: ${descMsg}`}</Text>
            <Text style={{ color: '#FFF', alignContent: 'center', textAlign: 'right' }}>{`${msg}`}</Text>
          </View>
          <View style={{ width: '100%', paddingHorizontal: '3%', paddingVertical: '2%', flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: '1px', borderBottomColor: '#FFF' }}>
            <Text style={{ color: '#FFF' }}>{`Wind: ${windMsg}m/s`}</Text>
            <Text style={{ color: '#FFF' }}>{`Pressure: ${presMsg}hPa`}</Text>
            <Text style={{ color: '#FFF' }}>{`Humidity: ${humiMsg}%`}</Text>
          </View>
        </View>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={clickHandler}
          style={styles.touchableOpacityStyle}>
          <Image source={require('./assets/refresh_icon.png')} style={styles.floatingButtonStyle} />
        </TouchableOpacity>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    height: '10%',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '3%',
    flexDirection: 'row',
  },
  verticalLine: {
    height: '70%',
    width: 1,
    backgroundColor: '#909090',
  },
  imageContainer: {
    height: '65%',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  bottomText: {
    alignItems: 'center',
    height: '25%',
  },
  touchableOpacityStyle: {
    position: 'absolute',
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    right: 20,
    bottom: 250,
  },
  floatingButtonStyle: {
    resizeMode: 'contain',
    width: 50,
    height: 50,
    //backgroundColor:'black'
  },
});