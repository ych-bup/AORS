import React, { useState, useEffect } from 'react';
import MapView, { Marker, Circle } from 'react-native-maps';
import { StyleSheet, View, Text } from 'react-native';
import * as Location from 'expo-location';
import { GoogleSpreadsheet, GoogleSpreadsheetRow } from "google-spreadsheet";
import * as cred from './cred.json';
import * as api from './api.json';

export default function App() {
  const [msg, setMsg] = useState('없음');
  const [region, setRegion] = useState({ latitude: 37, longitude: 127 });
  const [markers, setMarkers] = useState([]);
  const [weather, setWeather] = useState([]);
  const APP_ID = api.APP_ID;
  const T = 86400000;
  const THRESHOLD = 0.7;
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
    // 구글 인증이 필요하다.
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
        const obs = [];
        console.log(weatherCurrent.startTime.toLocaleTimeString());
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
            console.log(`Date: ${new Date(ctimestamp)}, lumen: ${lumen}`);
          }
        }
        if(isEmpty(obs)){
          setMsg("Can't observe");
        }
        else{
          setMsg(`complete: ${new Date(Math.min(...obs))} ${new Date(Math.max(...obs))}`);
        }
        setWeather(weatherCurrent);
      });
  };

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setMsg('Permission to access location was denied!');
        return;
      }
      setMsg('getting location...');
      let location = await Location.getCurrentPositionAsync({});
      let coords = location.coords;
      let region = {
        latitude: coords.latitude,
        longitude: coords.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };
      const doc = await getGoogleSheet();
      const place = doc.sheetsByTitle.place;
      await place.loadCells("A2:C");
      const sheet = await place.getRows();
      console.log(sheet[0]._rawData);
      let markers = sheet.map(value => {
        const data = value._rawData;
        return { latitude: data[1], longitude: data[2] };
      })
      setMsg('get weather data...');
      await callWeather(region);
      // setMsg('loading...');

      setRegion(region);
      setMarkers(markers);
    })();
  }, []);

  const markerOnClick = () => {
    alert("hello");
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text>안녕하세요</Text>
        <Text>{`달의 위상 ${weather?.moonPhase}`}</Text>
        <Text>{`월출 ${(new Date(weather?.moonrise)).getHours()}:${(new Date(weather?.moonrise)).getMinutes()}`}</Text>
        <Text>{`월몰 ${(new Date(weather?.moonset)).getHours()}:${(new Date(weather?.moonset)).getMinutes()}`}</Text>
      </View>
      <View style={styles.imageContainer}>
        <MapView style={styles.map} region={region}>
          {markers.map((coords) => (
            <>
              <Marker onPress={markerOnClick} coordinate={coords}/>
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
        <Text>
          {`메시지: ${msg}  일출: ${weather?.moonPhase} 일몰: ${weather?.moonPhase}`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    height: '10%',
    alignItems: 'center',
    justifyContent: 'space-between',
    margin: '1%',
  },
  imageContainer: {
    height: '80%',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  bottomText: {
    alignItems: 'center',
    height: '10%', 
    margin: '1%'
  },
});