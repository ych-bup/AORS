import React, { useState, useEffect, Component } from 'react';
import MapView, { Marker, Circle } from 'react-native-maps';
import { StyleSheet, View, Text, SafeAreaView } from 'react-native';
import { Moon } from 'lunarphase-js';
import * as Location from 'expo-location';
import { GoogleSpreadsheet, GoogleSpreadsheetRow } from "google-spreadsheet";
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as cred from './cred.json';
import * as api from './api.json';

export default function App() {
  const [msg, setMsg] = useState('없음');
  const [rt, setRT] = useState('test');
  const [locMsg, setLocMsg] = useState('0');
  const [temperature, setTemperature] = useState('0');
  const [cldMsg, setCldMsg] = useState('0');
  const [region, setRegion] = useState({ latitude: 37, longitude: 127 });
  const [markers, setMarkers] = useState([]);
  const [weather, setWeather] = useState([]);
  const APP_ID = api.APP_ID;
  const T = 86400000;
  const THRESHOLD = 0.3;
  const isEmpty = (arr) => {
    return Object.keys(arr).length == 0;
  };
  const readFirstSheetRow = async (doc) => {
    var sheet = doc.sheetBy[0]; // 첫번째 시티를 가져옵니다.
    var rows = await sheet.getRows({ offset: 3, limit: 100 }); // 세 번째 row 부터 100개 row를 가져옵니다.
    rows.forEach((ele) => {
      console.log(ele._rawData[0], ele._rawData[1]) // 읽어온 rows 중 현재row에서 첫 번째 컬럼과 두 번째 컬럼을 출력합니다.
    });
  }
  const getGoogleSheet = async () => {
    const doc = new GoogleSpreadsheet(api.SHEET, cred);
    // 구글 인증이 필요하다
    doc.auth.apiKey = api.API_KEY;
    console.log(api.API_KEY)
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
      time: new Date(current.dt * 1000),
      sunrise,
      sunset,
      moonrise,
      moonset,
      startTime,
    };
  };
  const dateToStr = (date) => {
    return `${date.getHours()}:${date.getMinutes()}`;
  };
  const getBonus = (weather) => {
    return (
      ((weather.sunset.getTime() - weather.sunrise.getTime()) / T - 0.5) * 3
    );
  };
  const dayCycle = (current_time, weather) => {
    const middleTime = new Date(
      (weather.sunrise.getTime() + weather.sunset.getTime()) / 2
    );
    const x = (middleTime.getMinutes() * 60 + middleTime.getSeconds()) * 1000;
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
          if (lumen >= THRESHOLD) {
            obs.push(ctimestamp);
            if (lumen >= maxLumen) {
              maxLumen = lumen;
              maxLumenCT = ctimestamp;
            }
            //console.log(`Date: ${new Date(ctimestamp)}, lumen: ${lumen}`);
          }
        }
        if (isEmpty(obs)) {
          setMsg(`Can't observe\n최고점수: ${(maxLumen * 100).toFixed(1)} 현재 점수: ${(nowLumen * 100).toFixed(1)}`);
        }
        else {
          //setMsg(`complete : ${new Date(Math.min(...obs))} ${new Date(Math.max(...obs))}`);
          setMsg(`최상의 컨디션 : ${(new Date(Math.max(maxLumenCT))).toLocaleTimeString()}\n현재 점수: ${(nowLumen * 100).toFixed(1)} 최고점수: ${(maxLumen * 100).toFixed(1)}\n${location.latitude} / ${location.longitude}`);
        }
        setWeather(weatherCurrent);
        setCldMsg(((1-weatherCurrent.clouds)*100).toFixed(1));
        setTemperature(weatherCurrent.temp.toFixed(1))
      });
  };

  useEffect(() => {
    const timerId = setInterval(() => {
      setRT((new Date()).toLocaleTimeString());
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
      let markers = sheet.map(value => {
        const data = value._rawData;
        return { latitude: data[1], longitude: data[2] };
      })
      setMsg('Getting weather data...');
      await callWeather(region);
      // setMsg('loading...');

      setRegion(region);
      setMarkers(markers);
    })();
    // return function cleanup() {
    //   clearInterval(timerId);
    // };
  }, []);

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
        setCldMsg(((1-weatherCurrent.clouds)*100).toFixed(1));
        setTemperature(weatherCurrent.temp.toFixed(1));
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
          if (lumen >= THRESHOLD) {
            obs.push(ctimestamp);
            if (lumen >= maxLumen) {
              maxLumen = lumen;
              maxLumenCT = ctimestamp;
            }
            //console.log(`Date: ${new Date(ctimestamp)}, lumen: ${lumen}`);
          }
        }
        if (isEmpty(obs)) {
          setMsg(`Can't observe\n최고점수: ${(maxLumen * 100).toFixed(1)} 현재 점수: ${(nowLumen * 100).toFixed(1)}`);
        }
        else {
          setMsg(`최상의 컨디션 : ${(new Date(Math.max(maxLumenCT))).toLocaleTimeString()}\n현재 점수: ${(nowLumen * 100).toFixed(1)} 최고점수: ${(maxLumen * 100).toFixed(1)}\n${location.latitude} / ${location.longitude}`);
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
          <View>
            <Text style={{ color: '#FFF', fontSize: 30 }}>{`${rt}`}</Text>
          </View>
          <View>
            <Text style={{ color: '#FFF' }}>
              {`월출 ${(new Date(weather?.moonrise)).getHours()}:${(new Date(weather?.moonrise)).getMinutes()}\n월몰 ${(new Date(weather?.moonset)).getHours()}:${(new Date(weather?.moonset)).getMinutes()}`}
            </Text>
          </View>
          <View>
            <Text style={{ color: '#FFF' }}>
              {`일출 ${(new Date(weather?.sunrise)).getHours()}:${(new Date(weather?.sunrise)).getMinutes()}\n일몰 ${(new Date(weather?.sunset)).getHours()}:${(new Date(weather?.sunset)).getMinutes()}`}
            </Text>
          </View>
        </View>
        <View style={styles.imageContainer}>
          <MapView style={styles.map} region={region}>
            <Marker coordinate={region} pinColor='#0000FF' onSelect={() => {locationLumen(region)}}/>
            {markers.map((coords) => (
              <>
                <Marker onSelect={() => locationLumen(coords)} coordinate={coords} />
                <Circle
                  center={coords}
                  radius={20}
                  strokeWidth={2}
                  strokeColor="#3399ff"
                  fillColor="#80bfff9f"
                />
              </>
            ))}
          </MapView>
        </View>
        <View style={styles.bottomText}>
          <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', borderBottomWidth: '1px', borderBottomColor: '#FFF', paddingHorizontal: '3%', paddingVertical: '2%' }}>
            <View>
              <Text style={{ color: '#FFF', fontSize: 45 }}>{`${temperature}°C`}</Text>
            </View>
            <View>
              <Text style={{ color: '#FFF', fontSize: 15 }}>{`${locMsg}`}</Text>
            </View>
          </View>
          <View style={{ width: '100%', paddingHorizontal: '3%', paddingVertical: '2%', flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: '#FFF' }}>{`Clouds : ${cldMsg}%`}</Text>
            <Text style={{ color: '#FFF', alignContent: 'center' }}>{`${msg}`}</Text>
          </View>
        </View>
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
  imageContainer: {
    height: '70%',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  bottomText: {
    alignItems: 'center',
    height: '20%',
  },
});